// Fires trusted PointerEvents with pointerType "pen" through Chromium's own
// input pipeline (CDP Input.dispatchMouseEvent, which takes a pointerType).
//
// Playwright's page.mouse only ever produces pointerType "mouse", and an
// event built with locator.dispatchEvent() is untrusted — untrusted pointer
// events report no coalesced events (that's the spec, not a bug), and the
// app reads pointermove through getCoalescedEvents(), so a synthetic event
// would silently draw nothing. Only a trusted event exercises the real path.
export async function penStroke(page, canvas, points) {
  const client = await page.context().newCDPSession(page);
  const box = await canvas.boundingBox();
  const abs = points.map(([x, y]) => ({ x: box.x + x, y: box.y + y }));

  const dispatch = (type, p, extra = {}) =>
    client.send('Input.dispatchMouseEvent', {
      type,
      x: p.x,
      y: p.y,
      button: 'left',
      pointerType: 'pen',
      ...extra,
    });

  await dispatch('mousePressed', abs[0], { buttons: 1, clickCount: 1 });
  for (const p of abs.slice(1)) await dispatch('mouseMoved', p, { buttons: 1 });
  await dispatch('mouseReleased', abs[abs.length - 1], { buttons: 0 });
}
