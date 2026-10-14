export function onDragStart() {
  document.body.classList.add('is-dragging-flow');

  const cleanup = () => {
    document.body.classList.remove('is-dragging-flow');
    window.removeEventListener('pointerup', cleanup, true);
    window.removeEventListener('mouseup', cleanup, true);
    window.removeEventListener('touchend', cleanup, true);
  };

  window.addEventListener('pointerup', cleanup, { capture: true, once: true });
  window.addEventListener('mouseup', cleanup, { capture: true, once: true });
  window.addEventListener('touchend', cleanup, { capture: true, once: true });
}

export function onDragEnd() {
  document.body.classList.remove('is-dragging-flow');
}
