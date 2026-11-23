'use strict';

// 中国語の原文をキーにすることで、翻訳のない従来の画面もそのまま表示できます。
window.UI = (() => {
  const languages = ['zh', 'en', 'ja'];
  const messages = new Map();
  let locale = navigator.languages.map(tag => tag.toLowerCase().split('-')[0])
    .find(language => languages.includes(language)) || 'zh';
  try {
    const saved = localStorage.getItem('uiLocale');
    if (languages.includes(saved)) locale = saved;
  } catch {
    // 保存領域が無効なブラウザでは、このページを開いている間だけ設定を使います。
  }

  function t(source, values = {}, language = locale) {
    const translated = language === 'zh' ? source : messages.get(source)?.[language === 'en' ? 0 : 1] ?? source;
    return translated.replace(/\{(\w+)\}/g, (original, key) => Object.hasOwn(values, key) ? values[key] : original);
  }

  function start() {
    const select = document.getElementById('uiLocale');
    const labels = [];
    const attributes = [];
    // 明示した画面領域の初期文言だけを記録します。素材カードや入力値は翻訳の対象外です。
    for (const section of document.querySelectorAll('[data-ui-section]')) {
      const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const source = node.data.trim();
        if (messages.has(source) && !node.parentElement.closest('[translate="no"]')) {
          labels.push({node, source, original: node.data});
        }
      }
      for (const element of [section, ...section.querySelectorAll('[aria-label],[placeholder],[title],[alt],[data-empty-label]')]) {
        for (const name of ['aria-label', 'placeholder', 'title', 'alt', 'data-empty-label']) {
          const source = element.getAttribute(name);
          if (source && messages.has(source)) attributes.push({element, name, source});
        }
      }
    }
    function apply() {
      document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale;
      select.value = locale;
      for (const {node, source, original} of labels) {
        if (node.isConnected) node.data = original.replace(source, () => t(source));
      }
      for (const {element, name, source} of attributes) {
        if (element.isConnected) element.setAttribute(name, t(source));
      }
    }
    apply();
    select.addEventListener('change', () => {
      locale = select.value;
      try {
        localStorage.setItem('uiLocale', locale);
      } catch {
        // プライベートモードなどでも、表示自体は切り替えます。
      }
      apply();
      // 動的な要素は各画面の描画処理に任せ、選択済みの素材や入力内容を引き継ぎます。
      window.dispatchEvent(new Event('uilocalechange'));
    });
  }
  return {
    get locale() { return locale; },
    register(entries) {
      for (const [key, translations] of Object.entries(entries)) messages.set(key, translations);
    },
    t, start
  };
})();
