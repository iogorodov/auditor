// iOS Safari: при открытии экранной клавиатуры layout-viewport остаётся во весь экран, а видимая
// область (visualViewport) сжимается И может «съехать» — браузер прокручивает страницу к полю
// ввода, выставляя visualViewport.offsetTop > 0. Если компенсировать только высоту, #app съезжает
// (поле улетает вверх, снизу вылезает фон, появляется вторая прокрутка).
//
// Поэтому жёстко прикрепляем #app к visualViewport: он position: fixed (CSS), а высоту и
// вертикальный сдвиг берём из visualViewport.height и .offsetTop. Тогда #app всегда точно
// накрывает видимую область над клавиатурой — шапка сверху, нижний бар над клавиатурой.

export function installViewportFix(): void {
  const vv = window.visualViewport;
  const root = document.getElementById('app');
  if (!vv || !root) return; // старые движки — остаётся CSS-фолбэк (fixed, height: 100%)

  const set = () => {
    root.style.height = `${vv.height}px`;
    root.style.transform = `translateY(${vv.offsetTop}px)`;
  };
  // Во время анимации клавиатуры события сыпятся пачками — коалесим в один кадр, чтобы не
  // дёргать layout по нескольку раз и не дробить движение (иначе «дёрганая» анимация).
  let scheduled = false;
  const apply = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; set(); });
  };

  vv.addEventListener('resize', apply);
  vv.addEventListener('scroll', apply); // iOS двигает visualViewport при фокусе — пересчитываем
  set();
}
