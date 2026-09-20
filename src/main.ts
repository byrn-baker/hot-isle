const classic = new URLSearchParams(location.search).get('mode') === 'classic';
if (classic) {
  void import('./campaign');
} else {
  document.getElementById('rotate-prompt')?.remove();
  void import('./tycoon/bootstrap').then(({ startTycoon }) => startTycoon()).catch((error: unknown) => {
    console.error(error);
    document.getElementById('game-container')!.innerHTML = '<div style="padding:48px;color:white;font:18px sans-serif">The tycoon room could not start. <a style="color:#76eed3" href="?mode=classic">Open the classic campaign</a></div>';
  });
}
export {};
