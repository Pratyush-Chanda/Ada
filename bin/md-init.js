    /* Set up markdown-it + Obsidian plugin once, reuse for all previews */
    (function () {
      var md = markdownit({
        html       : true,
        linkify    : true,
        typographer: true,
        breaks     : false
      });

      /* Optional markdown-it CDN plugins (check globals before using) */
      if (typeof markdownitSub      === 'function') md.use(markdownitSub);
      if (typeof markdownitSup      === 'function') md.use(markdownitSup);
      if (typeof markdownitFootnote === 'function') md.use(markdownitFootnote);

      /* Obsidian-specific syntax (wikilinks, callouts, embeds, tags, math,
         task lists, strikethrough, mermaid, code highlighting …)            */
      md.use(window.obsidianPlugin, {
        enableTikz   : true,   /* enable ```tikz fenced block → .tikz-source div */
        enableMermaid: true,   /* enable ```mermaid fenced block rendering        */
        resolveWikilink: function (target, alias, anchor) {
          return '#' + encodeURIComponent(target) + (anchor ? '%23' + encodeURIComponent(anchor) : '');
        },
        resolveEmbed: function (fileName) {
          /* Resolve embed path relative to the currently-rendering note's directory */
          var base = window._currentNotePath || '';
          if (!base) return fileName;
          var dir = base.substring(0, base.lastIndexOf('/') + 1);
          return dir + fileName;
        },
        resolveTag  : function (tag)      { return '#tag-' + encodeURIComponent(tag); }
      });

      /* Inject companion CSS once */
      var styleEl = document.createElement('style');
      styleEl.id  = 'obsidian-plugin-css';
      styleEl.textContent = window.obsidianGetCSS();
      document.head.appendChild(styleEl);

      /* Initialise Mermaid (startOnLoad:false — we call mermaid.run() manually) */
      if (typeof mermaid !== 'undefined') {
        var mermaidTheme = document.documentElement.dataset.themeMode === 'dark' ? 'dark' : 'default';
        mermaid.initialize({ startOnLoad: false, theme: mermaidTheme, securityLevel: 'loose' });
        /* Ada emits this event for both explicit mode choices and system-mode changes. */
        window.addEventListener('ada-theme-change', function (event) {
          var mode = event.detail && event.detail.mode;
          mermaid.initialize({ startOnLoad: false, theme: mode === 'dark' ? 'dark' : 'default', securityLevel: 'loose' });
        });
      }

      /* Expose the configured instance globally */
      window.md = md;
    }());
