// VX radio-key navigation v1.0.0. Native input radios retain browser behavior.
type RadioKeyEvent = {key: string; target: EventTarget | null; preventDefault(): void; stopPropagation(): void};
export function handleRadioKey(event: RadioKeyEvent): void {
  if (!(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'radio') return;
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const group = event.target.closest('[role="radiogroup"]') ?? event.target.closest('section') ?? event.target.parentElement;
  if (!group) return;
  const items = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).filter(item => !item.hasAttribute('disabled') && item.getAttribute('aria-disabled') !== 'true');
  const index = items.indexOf(event.target);
  if (index < 0 || !items.length) return;
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + items.length) % items.length;
  event.preventDefault(); event.stopPropagation();
  items[next].focus(); items[next].click();
}
