// Future versions of Hyper may add additional config options,
// which will not automatically be merged into this file.
// See https://hyper.is#cfg for all currently supported options.

module.exports = {
  config: {
    fontSize: 14,
    fontFamily:
      'Menlo, "DejaVu Sans Mono", Consolas, "Lucida Console", monospace',
    padding: "5px",
    paneNavigation: {
      hotkeys: {
        navigation: {
          up: "meta+up",
          down: "meta+down",
          left: "meta+left",
          right: "meta+right",
        },
        jump_prefix: "ctrl+alt", // completed with 1-9 digits
      },
      inactivePaneOpacity: 1,
    },
    hyperTransparent: {
      opacity: 0.8,
      vibrancy: "ultra-dark", // ['', 'dark', 'medium-light', 'ultra-dark']
    },
  },
  plugins: ["hyper-snazzy", "hyper-pane", "hyper-transparent"],
};
