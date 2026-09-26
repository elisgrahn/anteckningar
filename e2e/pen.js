// Fires trusted PointerEvents with pointerType "pen" through Chromium's own
// input pipeline (CDP Input.dispatchMouseEvent, which takes a pointerType).
//
// Playwright's page.mouse only ever produces pointerType "mouse", and an
// event built with locator.dispatchEvent() is untrusted — untrusted pointer
// events report no coalesced events (that's the spec, not a bug), and the
// app reads pointermove through getCoalescedEvents(), so a synthetic event
// would silently draw nothing. Only a trusted event exercises the real path.
// `forces` (0..1 per point, M8's pressure) and `buttons` (M8's eraser end —
// 32 is the spec's eraser-in-contact bit) let a caller exercise a Wacom-style
// pen beyond a plain same-pressure stroke, without every ordinary penStroke
// call having to know about either.
export async function penStroke(page, canvas, points, { forces, buttons = 1 } = {}) {
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

  const force = (i) => (forces ? { force: forces[i] } : {});
  await dispatch('mousePressed', abs[0], { buttons, clickCount: 1, ...force(0) });
  for (let i = 1; i < abs.length; i++) await dispatch('mouseMoved', abs[i], { buttons, ...force(i) });
  await dispatch('mouseReleased', abs[abs.length - 1], { buttons: 0, ...force(abs.length - 1) });
}
