#!/usr/bin/env bash
# Track Wi-Fi drops over time and work out which layer is failing.
#
# Samples the radio (RSSI/noise/channel/BSSID via CoreWLAN), the link, the router,
# the internet and DNS on a fixed interval, writes one TSV row per sample, then
# groups consecutive failures into outage episodes and reports what they have in common.
#
# Usage:
#   scripts/wifi-watch.sh watch [--interval 5] [--iface en0]   sample in the foreground
#   scripts/wifi-watch.sh start | stop | status                run it as a LaunchAgent
#   scripts/wifi-watch.sh report [--since 24h] [--verbose]     analyse what has been collected
#   scripts/wifi-watch.sh doctor                               one-shot health check, right now
#   scripts/wifi-watch.sh scan                                 what else is on your channel
#   scripts/wifi-watch.sh logs [--since 30m]                   curated airportd events
#
# Data lives in ~/.wifi-watch (override with WIFI_WATCH_DIR).

set -euo pipefail

DATA_DIR="${WIFI_WATCH_DIR:-$HOME/.wifi-watch}"
SAMPLES="$DATA_DIR/samples.tsv"
EVENTS="$DATA_DIR/events.log"
SNAPSHOT_JS="$DATA_DIR/snapshot.js"
PLIST="$HOME/Library/LaunchAgents/com.isaac.wifi-watch.plist"
LABEL="com.isaac.wifi-watch"
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

IFACE="${WIFI_WATCH_IFACE:-}"
INTERVAL=5
INET_TARGET="${WIFI_WATCH_INET:-1.1.1.1}"
DNS_TARGET="${WIFI_WATCH_DNS_NAME:-apple.com}"
RETAIN_DAYS="${WIFI_WATCH_RETAIN_DAYS:-14}"
# An outage that ends on a different network is a relocation, not a fault — but only
# if it lasted long enough to have walked somewhere. Below this, it is an SSID flip
# on the spot, which is a real fault.
MOVE_GAP="${WIFI_WATCH_MOVE_GAP:-120}"

die() { echo "wifi-watch: $*" >&2; exit 1; }

wifi_iface() {
  [ -n "$IFACE" ] && { echo "$IFACE"; return; }
  networksetup -listallhardwareports 2>/dev/null \
    | awk '/Hardware Port: Wi-Fi/{getline; print $2; exit}'
}

# ---------------------------------------------------------------- radio snapshot

write_snapshot_js() {
  cat > "$SNAPSHOT_JS" <<'JS_EOF'
ObjC.import('CoreWLAN');
var iface = $.CWWiFiClient.sharedWiFiClient.interface;
function str(v) { return (v && !v.isNil()) ? ObjC.unwrap(v) : ''; }
var chan = iface.wlanChannel;
var out = [
  str(iface.ssid),
  str(iface.bssid),
  chan.isNil() ? '' : String(chan.channelNumber),
  chan.isNil() ? '' : String(chan.channelBand),
  String(iface.rssiValue),
  String(iface.noiseMeasurement),
  String(iface.transmitRate),
  iface.powerOn ? '1' : '0'
];
// the final expression is what osascript prints to stdout; console.log goes to stderr
out.join('\x1f');
JS_EOF
}

# ssid, bssid, channel, band, rssi, noise, tx, power. ~120ms, and no scan, so
# sampling this often does not itself knock the radio off channel.
radio_snapshot() {
  # Unit-separator, not tab: bash `read` collapses runs of whitespace delimiters,
  # which would silently shift every field whenever SSID/BSSID come back empty.
  osascript -l JavaScript "$SNAPSHOT_JS" 2>/dev/null || printf '\x1f\x1f\x1f\x1f\x1f\x1f\x1f\n'
}

# CoreWLAN redacts SSID/BSSID unless the terminal has Location Services access.
band_name() { case "$1" in 1) echo 2.4GHz ;; 2) echo 5GHz ;; 3) echo 6GHz ;; *) echo "?" ;; esac; }

# ---------------------------------------------------------------- probes

default_gateway() { route -n get default 2>/dev/null | awk '/gateway:/{print $2; exit}'; }

# Echo round-trip ms, or -1 if unreachable. -t caps the whole call at 2s.
ping_ms() {
  local host="$1" out
  out="$(ping -c1 -W1200 -t2 "$host" 2>/dev/null | awk -F'time=' '/time=/{split($2,a," "); print a[1]; exit}')"
  [ -n "$out" ] && echo "$out" || echo "-1"
}

# Echo query ms, or -1 if resolution failed. Forces a real query, not the cache.
dns_ms() {
  local out
  out="$(dig +time=2 +tries=1 "$DNS_TARGET" 2>/dev/null \
    | awk '/^;; Query time:/{q=$4} /^;; ANSWER: 0/{bad=1} END{if (q=="" || bad) print "-1"; else print q}')"
  [ -n "$out" ] && echo "$out" || echo "-1"
}

# ---------------------------------------------------------------- sampling

# One sample: radio state, then probes from the inside out, stopping at the first failure.
sample_once() {
  local iface="$1" now iso snap ssid bssid chan band rssi noise tx power
  local link ip gw gw_ms inet_ms dq verdict

  now="$(date +%s)"
  iso="$(date -r "$now" '+%Y-%m-%dT%H:%M:%S')"

  snap="$(radio_snapshot)"
  IFS=$'\x1f' read -r ssid bssid chan band rssi noise tx power <<< "$snap"

  link="$(ifconfig "$iface" 2>/dev/null | awk '/status:/{print $2; exit}')"
  ip="$(ifconfig "$iface" 2>/dev/null | awk '/inet /{print $2; exit}')"
  gw="$(default_gateway)"
  gw_ms=-1; inet_ms=-1; dq=-1

  if [ "$power" = "0" ]; then
    verdict=wifi_off
  elif [ "$link" != "active" ]; then
    verdict=link_down
  elif [ -z "$ip" ]; then
    verdict=no_ip
  elif [ -z "$gw" ]; then
    verdict=no_route
  else
    # Never trust a single lost echo to the router: consumer routers deprioritise
    # ICMP to themselves under load, so always ask the internet for a second opinion
    # before calling it an outage.
    gw_ms="$(ping_ms "$gw")"
    inet_ms="$(ping_ms "$INET_TARGET")"
    if [ "$gw_ms" = "-1" ] && [ "$inet_ms" = "-1" ]; then
      verdict=gw_fail
    elif [ "$gw_ms" = "-1" ]; then
      verdict=gw_icmp
    elif [ "$inet_ms" = "-1" ]; then
      verdict=inet_fail
    else
      dq="$(dns_ms)"
      if [ "$dq" = "-1" ]; then verdict=dns_fail; else verdict=ok; fi
    fi
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$now" "$iso" "$verdict" "${link:-none}" "${ssid:-?}" "${bssid:-?}" \
    "${chan:-?}" "$(band_name "${band:-0}")" "${rssi:-0}" "${noise:-0}" \
    "${tx:-0}" "${gw:-none}" "$gw_ms" "$inet_ms" "$dq"
}

# Drop rows older than the retention window so a long-running sampler stays bounded.
trim_samples() {
  local cutoff tmp
  cutoff=$(($(date +%s) - RETAIN_DAYS * 86400))
  [ -s "$SAMPLES" ] || return 0
  tmp="$SAMPLES.trim"
  awk -F'\t' -v c="$cutoff" 'NR == 1 || $1 >= c' "$SAMPLES" > "$tmp" && mv "$tmp" "$SAMPLES"
}

cmd_watch() {
  local iface prev_verdict prev_change last_ts next_trim row ts verdict
  iface="$(wifi_iface)"
  [ -n "$iface" ] || die "no Wi-Fi interface found"

  mkdir -p "$DATA_DIR"
  write_snapshot_js
  [ -s "$SAMPLES" ] || printf 'ts\tiso\tverdict\tlink\tssid\tbssid\tchannel\tband\trssi\tnoise\ttx\tgateway\tgw_ms\tinet_ms\tdns_ms\n' > "$SAMPLES"

  trim_samples

  echo "wifi-watch: sampling $iface every ${INTERVAL}s into $SAMPLES (ctrl-c to stop)"
  prev_verdict=""; prev_change="$(date +%s)"; last_ts=0; next_trim=$((prev_change + 86400))

  while :; do
    row="$(sample_once "$iface")"
    ts="$(printf '%s' "$row" | cut -f1)"
    verdict="$(printf '%s' "$row" | cut -f3)"

    # A long silence means the machine slept or the watcher was stopped — not an outage.
    if [ "$last_ts" -gt 0 ] && [ $((ts - last_ts)) -gt $((INTERVAL * 3)) ]; then
      printf '%s\t%s\tgap\tnone\t?\t?\t?\t?\t0\t0\t0\tnone\t-1\t-1\t-1\n' \
        "$((last_ts + INTERVAL))" "$(date -r $((last_ts + INTERVAL)) '+%Y-%m-%dT%H:%M:%S')" >> "$SAMPLES"
      prev_verdict=""
    fi
    last_ts="$ts"

    printf '%s\n' "$row" >> "$SAMPLES"

    if [ "$ts" -ge "$next_trim" ]; then trim_samples; next_trim=$((ts + 86400)); fi

    if [ "$verdict" != "$prev_verdict" ]; then
      [ -n "$prev_verdict" ] && \
        echo "$(date -r "$ts" '+%Y-%m-%d %H:%M:%S')  $prev_verdict -> $verdict  (held $((ts - prev_change))s)" >> "$EVENTS"
      prev_verdict="$verdict"; prev_change="$ts"
    fi

    sleep "$INTERVAL"
  done
}

# ---------------------------------------------------------------- launchagent

cmd_start() {
  mkdir -p "$DATA_DIR" "$(dirname "$PLIST")"
  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SELF</string>
    <string>watch</string>
    <string>--interval</string>
    <string>$INTERVAL</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DATA_DIR/watch.out</string>
  <key>StandardErrorPath</key><string>$DATA_DIR/watch.err</string>
</dict>
</plist>
PLIST_EOF
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  echo "wifi-watch: running in the background, sampling every ${INTERVAL}s"
  echo "  data:  $SAMPLES"
  echo "  check: $(basename "$SELF") report"
}

cmd_stop() {
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "wifi-watch: stopped. Collected data is kept in $DATA_DIR"
}

cmd_status() {
  if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
    echo "running"
  else
    echo "not running"
  fi
  [ -s "$SAMPLES" ] || { echo "no samples collected yet"; return; }
  echo "samples: $(($(wc -l < "$SAMPLES") - 1))"
  echo "first:   $(sed -n '2p' "$SAMPLES" | cut -f2)"
  echo "last:    $(tail -1 "$SAMPLES" | cut -f2)"
}

# ---------------------------------------------------------------- report

cmd_report() {
  local since="${1:-24h}" verbose="${2:-0}" cutoff secs unit num
  [ -s "$SAMPLES" ] || die "no samples yet — run '$(basename "$SELF") start' and leave it collecting"

  num="$(printf '%s' "$since" | sed 's/[^0-9]//g')"
  unit="$(printf '%s' "$since" | sed 's/[0-9]//g')"
  case "$unit" in
    m) secs=$((num * 60)) ;;
    h|"") secs=$((num * 3600)) ;;
    d) secs=$((num * 86400)) ;;
    *) die "bad --since '$since' (use 90m, 24h, 7d)" ;;
  esac
  cutoff=$(($(date +%s) - secs))

  awk -F'\t' -v cutoff="$cutoff" -v interval="$INTERVAL" -v verbose="$verbose" -v move_gap="$MOVE_GAP" '
    function fmt_dur(s) {
      s = int(s + 0.5);
      if (s < 60) return s "s";
      if (s < 3600) return sprintf("%dm%02ds", s/60, s%60);
      return sprintf("%dh%02dm", s/3600, (s%3600)/60);
    }
    function median(arr, n,   i, j, v, tmp) {
      if (n == 0) return 0;
      for (i = 1; i <= n; i++) tmp[i] = arr[i];
      # insertion sort — n is small (one entry per outage)
      for (i = 2; i <= n; i++) { v = tmp[i]; j = i - 1;
        while (j > 0 && tmp[j] > v) { tmp[j+1] = tmp[j]; j-- } tmp[j+1] = v }
      return (n % 2) ? tmp[(n+1)/2] : (tmp[n/2] + tmp[n/2+1]) / 2;
    }

    NR == 1 { next }
    $1 < cutoff { next }

    {
      ts = $1 + 0; verdict = $3; rssi = $9 + 0; bssid = $6; chan = $7;
      total++;
      if (first_ts == 0) { first_ts = ts; first_iso = $2 }
      last_ts = ts; last_iso = $2;

      if (verdict == "ok" || verdict == "gw_icmp") {
        ok_n++; if (rssi < 0) ok_rssi[++ok_rssi_n] = rssi;
        if ($13 + 0 >= 0) { gw_sum += $13; gw_n++ }
        if ($14 + 0 >= 0) { inet_sum += $14; inet_n++ }
      }

      # roaming: the AP or channel changed between two samples
      if (bssid != "?" && bssid != "" && prev_bssid != "" && bssid != prev_bssid) {
        roam_n++; roam_ts[roam_n] = ts;
      }
      if (chan != "?" && chan != "" && prev_chan != "" && chan != prev_chan) {
        chan_n++; chan_ts[chan_n] = ts;
      }
      # A different gateway means a different network entirely — a guest/main SSID
      # flip, say. Unlike SSID and BSSID this is never redacted, so it always works.
      gw_ip = $12;
      if (gw_ip != "none" && gw_ip != "" && prev_gw != "" && gw_ip != prev_gw) {
        net_n++; net_ts[net_n] = ts;
      }
      if (gw_ip != "none" && gw_ip != "") { prev_gw = gw_ip; seen_gw[gw_ip] = 1 }
      ssid = $5;
      if (ssid != "?" && ssid != "" && prev_ssid != "" && ssid != prev_ssid) {
        ssid_n++; ssid_ts[ssid_n] = ts;
      }
      if (ssid != "?" && ssid != "") { prev_ssid = ssid; seen_ssid[ssid] = 1 }
      if (bssid != "?" && bssid != "") prev_bssid = bssid;
      if (chan != "?" && chan != "") prev_chan = chan;

      if (verdict == "gw_icmp") icmp_n++;
      bad = (verdict != "ok" && verdict != "gw_icmp" && verdict != "gap");

      if (verdict == "gap") {
        gap_n++;
        if (in_ep && ep_dur[ep_n] == 0) {
          d = ep_last_bad[ep_n] - ep_start[ep_n];
          ep_dur[ep_n] = (d > 0) ? d : interval;
        }
        in_ep = 0; last_ok_ts = 0; last_ok_rssi = 0;
        gap_from = cur_net; gap_pending = 1; gap_iso = $2;
        next
      }

      # Coming back from a sleep on a different network: you were carried somewhere.
      if (!bad && gap_pending) {
        if (gap_from != "" && gw_ip != "none" && gw_ip != "" && gw_ip != gap_from) {
          move_n++; move_from[move_n] = gap_from; move_to[move_n] = gw_ip;
          move_iso[move_n] = gap_iso; move_why[move_n] = "across a sleep/gap";
        }
        gap_pending = 0;
      }

      if (bad && !in_ep) {
        in_ep = 1; ep_n++;
        ep_start[ep_n] = (last_ok_ts ? last_ok_ts : ts);
        ep_first_bad[ep_n] = ts;
        ep_kind[ep_n] = verdict;
        ep_pre_rssi[ep_n] = last_ok_rssi;
        ep_hour[ep_n] = substr($2, 12, 2);
        ep_iso[ep_n] = $2;
        ep_net[ep_n] = cur_net;
        ep_badn[ep_n] = 1;
        ep_last_bad[ep_n] = ts;
        if (gap_pending) ep_postgap[ep_n] = 1;
      } else if (bad && in_ep) {
        ep_badn[ep_n]++; ep_last_bad[ep_n] = ts;
        # an episode that changes character is named for its worst layer
        if (ep_kind[ep_n] == "dns_fail" && verdict != "dns_fail") ep_kind[ep_n] = verdict;
      } else if (!bad && in_ep) {
        in_ep = 0;
        ep_dur[ep_n] = ts - ep_start[ep_n];
        if (ep_net[ep_n] != "" && gw_ip != "none" && gw_ip != "" && gw_ip != ep_net[ep_n]) {
          if (ep_dur[ep_n] >= move_gap || ep_postgap[ep_n]) {
            ep_move[ep_n] = 1;
            move_n++; move_from[move_n] = ep_net[ep_n]; move_to[move_n] = gw_ip;
            move_iso[move_n] = ep_iso[ep_n]; move_dur[move_n] = ep_dur[ep_n];
            move_why[move_n] = ep_postgap[ep_n] ? "across a sleep/gap" : "";
          } else {
            ep_flip[ep_n] = 1;
          }
        }
      }

      if (!bad) { last_ok_ts = ts; last_ok_rssi = rssi }

      # The network in effect for this sample. During an outage the gateway is gone,
      # so this keeps naming the one you dropped off — which is what we want to blame.
      loc = (gw_ip != "none" && gw_ip != "") ? gw_ip : cur_net;
      if (loc != "") { loc_samples[loc]++; if (!bad) loc_ok[loc]++ }
      if (gw_ip != "none" && gw_ip != "") {
        cur_net = gw_ip;
        if (ssid != "?" && ssid != "") net_name[gw_ip] = ssid;
      }
    }

    END {
      if (total == 0) { print "No samples in that window."; exit }
      if (in_ep) ep_dur[ep_n] = last_ts - ep_start[ep_n];

      # Relocations are not faults. Split them out before any statistic is computed.
      fn = 0;
      for (i = 1; i <= ep_n; i++) {
        if (ep_move[i] || ep_postgap[i]) {
          if (ep_net[i] != "") loc_samples[ep_net[i]] -= ep_badn[i];
          if (!ep_move[i]) wake_n++;
          continue;
        }
        fn++;
        f_dur[fn] = ep_dur[i]; f_kind[fn] = ep_kind[i]; f_hour[fn] = ep_hour[i];
        f_iso[fn] = ep_iso[i]; f_pre[fn] = ep_pre_rssi[i]; f_start[fn] = ep_start[i];
        f_firstbad[fn] = ep_first_bad[i]; f_net[fn] = ep_net[i]; f_flip[fn] = ep_flip[i];
        f_badn[fn] = ep_badn[i];
        if (ep_net[i] != "") { loc_out[ep_net[i]]++; loc_down[ep_net[i]] += ep_dur[i] }
      }

      span = last_ts - first_ts;
      moved = 0; for (i = 1; i <= ep_n; i++) if (ep_move[i]) moved += ep_dur[i];

      printf "Window      %s -> %s  (%s)\n", pretty(first_iso), pretty(last_iso), fmt_dur(span);
      printf "Samples     %d  (%d clean, %.2f%% of samples healthy)\n", total, ok_n, 100 * ok_n / total;

      down = 0;
      for (i = 1; i <= fn; i++) { down += f_dur[i]; durs[i] = f_dur[i] }
      printf "Outages     %d episode%s, %s of downtime", fn, (fn == 1 ? "" : "s"), fmt_dur(down);
      if (span - moved > 0) printf "  (%.2f%% of the time you were settled)", 100 * down / (span - moved);
      printf "\n";
      if (move_n) printf "Moves       %d location change%s, %s excluded from the figures above\n", move_n, (move_n == 1 ? "" : "s"), fmt_dur(moved);
      if (gap_n) printf "Gaps        %d (machine asleep or watcher stopped — excluded)\n", gap_n;
      if (wake_n) printf "Wake-ups    %d re-association%s after a sleep — excluded, that is not a fault\n", wake_n, (wake_n == 1 ? "" : "s");
      if (icmp_n) printf "Router ICMP %d sample%s where the router ignored a ping but the internet still answered — not an outage\n", icmp_n, (icmp_n == 1 ? "" : "s");
      if (ok_n) {
        printf "Signal      RSSI median %d dBm when healthy", median(ok_rssi, ok_rssi_n);
        if (gw_n) printf ", router %.1f ms", gw_sum / gw_n;
        if (inet_n) printf ", internet %.1f ms", inet_sum / inet_n;
        printf "\n";
      }

      locs = 0; for (g in loc_samples) locs++;
      if (locs > 1) {
        print "";
        print "Where you were";
        for (g in loc_samples)
          printf "  %-34s %5d samples  %6.2f%% healthy  %d outage%s, %s down\n",
            label(g), loc_samples[g], 100 * loc_ok[g] / loc_samples[g],
            loc_out[g] + 0, (loc_out[g] + 0 == 1 ? "" : "s"), fmt_dur(loc_down[g] + 0);
      }

      if (move_n) {
        print "";
        print "Location changes (not counted as faults)";
        for (i = 1; i <= move_n; i++)
          printf "  %s  %s -> %s%s%s\n", pretty(move_iso[i]), label(move_from[i]), label(move_to[i]),
            (move_dur[i] ? sprintf("  (%s offline)", fmt_dur(move_dur[i])) : ""),
            (move_why[i] != "" ? "  " move_why[i] : "");
      }

      if (fn == 0) {
        print "";
        print "No drops recorded in this window, once location changes are set aside.";
        exit
      }

      print "";
      single = 0; for (i = 1; i <= fn; i++) if (f_badn[i] <= 1) single++;
      printf "Duration    shortest %s, median %s, longest %s\n",
        fmt_dur(min_of(durs, fn)), fmt_dur(median(durs, fn)), fmt_dur(max_of(durs, fn));
      if (single > 0)
        printf "            %d of %d lasted a single sample, so those are upper bounds (<=%ds), not measurements\n",
          single, fn, interval * 2 + 3;

      print "";
      print "How the drops failed";
      for (i = 1; i <= fn; i++) kind_n[f_kind[i]]++;
      for (k in kind_n) printf "  %-10s %3d  %s\n", k, kind_n[k], explain(k);

      print "";
      print "When they happened";
      for (i = 1; i <= fn; i++) hour_n[f_hour[i]]++;
      for (h = 0; h < 24; h++) {
        hh = sprintf("%02d", h);
        if (hour_n[hh]) { bar = ""; for (b = 0; b < hour_n[hh]; b++) bar = bar "#";
          printf "  %s:00  %-3d %s\n", hh, hour_n[hh], bar }
      }

      # correlate each outage with an AP or channel change in the 60s before it
      near = 0; flips = 0;
      for (i = 1; i <= fn; i++) {
        if (f_flip[i]) flips++;
        hit = 0;
        for (r = 1; r <= roam_n; r++) if (roam_ts[r] >= f_start[i] - 60 && roam_ts[r] <= f_firstbad[i] + interval) hit = 1;
        for (c = 1; c <= chan_n; c++) if (chan_ts[c] >= f_start[i] - 60 && chan_ts[c] <= f_firstbad[i] + interval) hit = 1;
        for (g = 1; g <= net_n; g++) if (net_ts[g] >= f_start[i] - 60 && net_ts[g] <= f_firstbad[i] + interval) hit = 1;
        for (u = 1; u <= ssid_n; u++) if (ssid_ts[u] >= f_start[i] - 60 && ssid_ts[u] <= f_firstbad[i] + interval) hit = 1;
        if (hit) near++;
      }

      pre_n = 0;
      for (i = 1; i <= fn; i++) if (f_pre[i] < 0) pre[++pre_n] = f_pre[i];
      pre_med = median(pre, pre_n);

      print "";
      print "What the numbers point at";

      if (flips > 0) {
        printf "  * %d drop%s ended on a different network within %ds — an SSID flip on the spot, not you moving.\n",
          flips, (flips == 1 ? "" : "s"), move_gap;
        print "    Fix: Wi-Fi settings > Details on each network you do not want, and turn off Auto-Join.";
      }
      link_like = kind_n["link_down"] + kind_n["wifi_off"] + kind_n["no_ip"] + kind_n["no_route"];
      if (link_like > 0)
        printf "  * %d drop%s lost the association itself — the Mac was kicked off, not merely slowed.\n", link_like, (link_like == 1 ? "" : "s");
      if (kind_n["gw_fail"] > 0)
        printf "  * %d drop%s kept an active link but reached neither the router nor the internet — access point or airtime, not your ISP.\n", kind_n["gw_fail"], (kind_n["gw_fail"] == 1 ? "" : "s");
      if (kind_n["inet_fail"] > 0)
        printf "  * %d drop%s reached the router fine but not the internet — that is upstream of your Wi-Fi (ISP or router WAN).\n", kind_n["inet_fail"], (kind_n["inet_fail"] == 1 ? "" : "s");
      if (kind_n["dns_fail"] > 0)
        printf "  * %d drop%s had working connectivity and only DNS failed — change resolvers before blaming the Wi-Fi.\n", kind_n["dns_fail"], (kind_n["dns_fail"] == 1 ? "" : "s");
      if (pre_n > 0 && pre_med <= -70)
        printf "  * Median signal just before a drop was %d dBm (weak). Distance, walls or interference.\n", pre_med;
      else if (pre_n > 0 && ok_rssi_n > 0 && pre_med <= median(ok_rssi, ok_rssi_n) - 5)
        printf "  * Signal sagged to %d dBm before drops versus %d dBm normally — the link degrades first, it does not snap.\n", pre_med, median(ok_rssi, ok_rssi_n);
      else if (pre_n > 0)
        printf "  * Signal was healthy (%d dBm) right up to the drops — not a range problem.\n", pre_med;
      hops = (roam_n > 0) ? roam_n : chan_n;
      how  = (roam_n > 0) ? "by BSSID" : "by channel, since BSSID is hidden";
      if (hops > 0)
        printf "  * %d access-point change%s (%s); %d of %d drops sit within a minute of one.\n",
          hops, (hops == 1 ? "" : "s"), how, near, fn;
      if (fn > 2 && near >= fn * 0.4 && hops > 0)
        print "  * That is a roaming pattern: the Mac is hopping between access points and stalling on the handover.";
      if (roam_n == 0 && chan_n > 0)
        print "    (Two APs sharing one channel would look like no hop at all — the one thing channel cannot see.)";

      if (verbose) {
        print "";
        print "Every outage";
        for (i = 1; i <= fn; i++)
          printf "  %s  %-10s %-7s  %-34s signal before: %s dBm\n", f_iso[i], f_kind[i], fmt_dur(f_dur[i]),
            label(f_net[i]), (f_pre[i] < 0 ? f_pre[i] "" : "n/a");
      }
    }

    function explain(k) {
      if (k == "link_down") return "Wi-Fi link went down (deassociated from the AP)";
      if (k == "wifi_off")  return "Wi-Fi radio was off";
      if (k == "no_ip")     return "associated but no IP address (DHCP)";
      if (k == "no_route")  return "no default route";
      if (k == "gw_fail")   return "neither router nor internet reachable, link still up";
      if (k == "gw_icmp")   return "router ignored ICMP, internet fine (not an outage)";
      if (k == "inet_fail") return "router reachable, internet was not";
      if (k == "dns_fail")  return "connectivity fine, DNS resolution failed";
      return "";
    }
    function label(g) { if (g == "") return "unknown"; return (g in net_name) ? net_name[g] " (" g ")" : g }
    function pretty(iso) { return substr(iso, 1, 10) " " substr(iso, 12, 5) }
    function min_of(a, n,   i, m) { m = a[1]; for (i = 2; i <= n; i++) if (a[i] < m) m = a[i]; return m }
    function max_of(a, n,   i, m) { m = a[1]; for (i = 2; i <= n; i++) if (a[i] > m) m = a[i]; return m }
  ' "$SAMPLES"
}

# ---------------------------------------------------------------- doctor

cmd_doctor() {
  local iface snap ssid bssid chan band rssi noise tx power snr gw
  iface="$(wifi_iface)"
  [ -n "$iface" ] || die "no Wi-Fi interface found"

  mkdir -p "$DATA_DIR"; write_snapshot_js
  snap="$(radio_snapshot)"
  IFS=$'\x1f' read -r ssid bssid chan band rssi noise tx power <<< "$snap"

  echo "Interface   $iface  (radio $([ "$power" = "1" ] && echo on || echo OFF))"
  if [ -z "$ssid" ]; then
    ssid="$(system_profiler SPAirPortDataType 2>/dev/null \
      | awk '/Current Network Information:/{getline; sub(/^ +/,""); sub(/:$/,""); print; exit}')"
  fi
  echo "Network     ${ssid:-unknown}${bssid:+  AP $bssid}"
  echo "Channel     ${chan:-?} ($(band_name "${band:-0}"))   tx rate ${tx:-?} Mbps"

  snr=$(( ${rssi:-0} - ${noise:--100} ))
  printf "Signal      %s dBm, noise %s dBm, SNR %s dB — %s\n" "${rssi:-?}" "${noise:-?}" "$snr" \
    "$(if [ "$snr" -ge 40 ]; then echo excellent; elif [ "$snr" -ge 25 ]; then echo good;
       elif [ "$snr" -ge 15 ]; then echo "marginal — expect stalls"; else echo "bad — drops are expected here"; fi)"

  gw="$(default_gateway)"
  echo "Router      ${gw:-none}  $(ping_ms "${gw:-127.0.0.1}") ms"
  echo "Internet    $INET_TARGET  $(ping_ms "$INET_TARGET") ms"
  echo "DNS         $(scutil --dns 2>/dev/null | awk '/nameserver\[0\]/{print $3; exit}')  $(dns_ms) ms for $DNS_TARGET"

  echo ""
  if [ -z "$bssid" ]; then
    echo "! BSSID is hidden, so this cannot tell one access point from another."
    echo "  Roaming between APs is a top suspect for repeated drops, so grant access:"
    echo "  System Settings > Privacy & Security > Location Services > enable for your terminal app."
  fi
  if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
    echo "* Background tracking is running. Leave it for a few hours, then: $(basename "$SELF") report"
  else
    echo "* Nothing is tracking yet. Start it with: $(basename "$SELF") start"
  fi
  echo "* For the driver's own view (needs a password): sudo wdutil info"
}

# ---------------------------------------------------------------- scan

cmd_scan() {
  echo "Scanning (a few seconds — this briefly takes the radio off channel)..."
  system_profiler SPAirPortDataType 2>/dev/null | awk '
    /Current Network Information:/ { mode = "cur"; next }
    /Other Local Wi-Fi Networks:/  { mode = "other"; next }
    mode == "" { next }

    # A network heading is an indented line ending in ":" with nothing after it.
    /^ +[^ ].*:$/ && !/:.+/ {
      name = $0; sub(/^ +/, "", name); sub(/:$/, "", name);
      if (mode == "cur") { mine = name; cur_is_mine = 1 }
      else { n++; rec_name[n] = name; cur_is_mine = 0 }
      next
    }
    /Channel:/ { split($0, a, ": "); split(a[2], b, " ");
                 if (cur_is_mine) mych = b[1]; else rec_ch[n] = b[1] }
    /Signal/   { split($0, a, ": ");
                 if (cur_is_mine) mysig = a[2]; else rec_sig[n] = a[2] }

    END {
      printf "You are on channel %s as \"%s\" (%s)\n\n", mych, mine, mysig;
      for (i = 1; i <= n; i++) {
        c = rec_ch[i]; if (c == "") continue;
        pop[c]++;
        if (rec_name[i] == mine) same_ssid[c]++;
        if (c == mych) { split(rec_sig[i], sg, " "); if (strongest == "" || sg[1] + 0 > strongest + 0) { strongest = sg[1]; strongest_name = rec_name[i] } }
      }
      print "Networks per channel, busiest first:";
      for (c in pop) printf "%3d\t%s\t%d\n", pop[c], c, same_ssid[c] | "sort -rn";
      close("sort -rn");
      print "";
      mine_here = pop[mych] + 0; own = same_ssid[mych] + 0; foreign = mine_here - own;
      if (own > 0)
        printf "* %d of the %d on your channel %s your own network on other access points.\n", own, mine_here, (own == 1 ? "is" : "are");
      if (foreign >= 3)
        printf "! %d foreign networks also sit on channel %s (strongest %s, %s dBm). Co-channel contention is a real suspect — move the router to a quieter channel.\n", foreign, mych, strongest_name, strongest;
      else
        printf "* Only %d foreign network%s on channel %s — congestion is unlikely to be your problem.\n", foreign, (foreign == 1 ? "" : "s"), mych;
    }'
}

# ---------------------------------------------------------------- logs

cmd_logs() {
  local since="${1:-30m}"
  echo "airportd events in the last $since (association, roaming, link changes):"
  /usr/bin/log show --last "$since" --predicate 'process == "airportd"' --style compact 2>/dev/null \
    | grep -E 'Assoc:|Roam:|lastJoinReason|firstSSIDTransition|LINK_CHANGED|DISASSOC|DEAUTH|BSSID_CHANGED|POWER_CHANGED' \
    | grep -vE 'RSSI_CHANGED|LQM_UPDATE|REALTIME_SESSION|roamingProfileTypeForSSID|__updateRoamingProfile' \
    | sed 's/\[[0-9][0-9]*:[0-9a-f]*\]//' \
    | awk '{ msg = substr($0, index($0, "airportd")); if (msg != prev) print substr($0, 1, 200); prev = msg }' \
    || echo "  (none — either quiet, or the window is too short)"
}

# ---------------------------------------------------------------- args

cmd="${1:-}"; shift || true
since=""; verbose=0
while [ $# -gt 0 ]; do
  case "$1" in
    --interval) INTERVAL="$2"; shift 2 ;;
    --iface)    IFACE="$2"; shift 2 ;;
    --since)    since="$2"; shift 2 ;;
    --move-gap) MOVE_GAP="$2"; shift 2 ;;
    --verbose)  verbose=1; shift ;;
    *) die "unknown option '$1'" ;;
  esac
done

case "$cmd" in
  watch)  cmd_watch ;;
  start)  cmd_start ;;
  stop)   cmd_stop ;;
  status) cmd_status ;;
  report) cmd_report "${since:-24h}" "$verbose" ;;
  doctor) cmd_doctor ;;
  scan)   cmd_scan ;;
  logs)   cmd_logs "${since:-30m}" ;;
  *) sed -n '2,20p' "$SELF" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
