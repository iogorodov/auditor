// iOS Safari: при открытии экранной клавиатуры layout-viewport (100%/100vh) остаётся во весь
// экран, а видимая область (visualViewport) сжимается. Браузер прокручивает документ к полю
// ввода — и sticky-шапка уезжает вверх за край, а футер прячется под клавиатурой.
//
// Лечим «грязным», но стандартным для iOS приёмом: держим высоту #app равной visualViewport.height
// (переменная --app-height). Тогда над клавиатурой сжимается только прокручиваемая середина
// (.screen__content), а шапка и футер остаются на месте. Скролл документа заблокирован в CSS.

export function installViewportFix(): void {
  const vv = window.visualViewport;
  if (!vv) return; // старые движки — остаётся CSS-фолбэк height: 100%

  const apply = () => {
    document.documentElement.style.setProperty('--app-height', `${vv.height}px`);
  };

  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply); // iOS сдвигает visualViewport при фокусе — пересчитываем
  apply();
}
