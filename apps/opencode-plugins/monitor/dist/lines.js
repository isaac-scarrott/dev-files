import { StringDecoder } from "node:string_decoder";
/**
 * Turns output chunks into lines. A chunk can end mid-line (or mid-character), so the unfinished tail waits for the
 * next chunk. A tail longer than `maxLineChars` is cut off and emitted with a marker so one endless line cannot grow
 * memory.
 */
export class LineSplitter {
    maxLineChars;
    decoder = new StringDecoder("utf8");
    tail = "";
    cut = false;
    constructor(maxLineChars) {
        this.maxLineChars = maxLineChars;
    }
    push(chunk) {
        const text = this.tail + (typeof chunk === "string" ? chunk : this.decoder.write(chunk));
        const parts = text.split("\n");
        this.tail = parts.pop() ?? "";
        const lines = parts.map((part) => this.finish(part));
        if (this.tail.length > this.maxLineChars) {
            lines.push(this.finish(this.tail));
            this.tail = "";
            this.cut = true;
        }
        return lines;
    }
    /** Output that ended without a trailing newline. */
    flush() {
        const rest = this.tail + this.decoder.end();
        this.tail = "";
        return rest === "" ? [] : [this.finish(rest)];
    }
    finish(raw) {
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
        const marker = this.cut ? "…" : "";
        this.cut = false;
        const clipped = line.length > this.maxLineChars ? `${line.slice(0, this.maxLineChars)} …[line cut]` : line;
        return marker + clipped;
    }
}
//# sourceMappingURL=lines.js.map