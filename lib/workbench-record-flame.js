const width = 144;
const height = 148;
const scale = 2;
const emitters = [-2.98, -2.61, -2.04, -1.0, -.35];

function makeGlow(stops) {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 48;
  const context = sprite.getContext('2d');
  const gradient = context.createRadialGradient(24, 24, 0, 24, 24, 24);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 48, 48);
  return sprite;
}

export function mountRecordFlame(canvas, signal) {
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  context.scale(scale, scale);

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const flame = makeGlow([
    [0, '#fbffff'], [.18, '#d6fcfff2'], [.4, '#63e5ffc4'],
    [.66, '#328fff6c'], [.84, '#186cc52c'], [1, '#1255ab00'],
  ]);
  const haze = makeGlow([
    [0, '#8ee5ff6e'], [.3, '#58bbf45a'], [.63, '#287fd329'], [1, '#4284b600'],
  ]);
  const spark = makeGlow([
    [0, '#ffffff'], [.23, '#e4fbffe8'], [.5, '#97eaff66'], [1, '#3f9fe900'],
  ]);

  let particles = [];
  let playing = false;
  let frame;
  let previous = 0;
  let carry = 0;
  let sequence = 0;
  const random = (min, max) => min + Math.random() * (max - min);

  function emit() {
    const angle = emitters[sequence % emitters.length] + random(-.09, .09);
    const kind = sequence % 7 < 2 ? 'spark' : sequence % 7 === 2 ? 'haze' : 'flame';
    sequence++;
    const radial = Math.cos(angle);
    particles.push({
      kind,
      life: kind === 'spark' ? random(.50, .83) : random(.48, .78),
      age: 0,
      x: 72 + 48 * radial,
      y: 87 + 48 * Math.sin(angle),
      drift: radial * random(9, 18),
      rise: kind === 'spark' ? random(44, 64) : random(33, 55),
      curl: random(-14, 14),
      size: kind === 'spark' ? random(2.1, 4) : random(9, 15),
    });
  }

  function renderParticle(particle) {
    const { kind, age, life, x, y, drift, rise, curl, size } = particle;
    const progress = age / life;
    const opacity = Math.min(age * 23, 1) * (1 - progress) ** 1.5;
    const stamp = (sprite, time, spread, strength) => {
      const along = Math.max(0, time);
      const bend = Math.sin(along * 7) * curl * along;
      const cx = x + drift * along + bend;
      const cy = y - rise * along + 9 * along * along;
      context.globalAlpha = strength;
      context.drawImage(sprite, cx - spread / 2, cy - spread / 2, spread, spread);
    };

    if (kind === 'spark') {
      stamp(spark, age - .025, size * .85, opacity * .33);
      stamp(spark, age, size, opacity * .95);
    } else if (kind === 'haze') {
      stamp(haze, age, size * (1.5 + progress), opacity * .75);
    } else {
      const spread = size * (1.10 - .39 * progress);
      stamp(haze, age, spread * 2.1, opacity * .6);
      for (let part = 4; part >= 0; part--) {
        stamp(flame, age - part * .043, spread * (.58 + part * .13), opacity * (.72 - part * .11));
      }
    }
  }

  function tick(now) {
    const dt = previous ? Math.min((now - previous) / 1000, .05) : 1 / 60;
    previous = now;
    carry += dt * 31;
    while (carry >= 1) {
      if (particles.length < 27) emit();
      carry--;
    }
    context.clearRect(0, 0, width, height);
    particles = particles.filter(particle => (particle.age += dt) < particle.life);
    for (const particle of particles) renderParticle(particle);
    context.globalAlpha = 1;
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    previous = 0;
    carry = 0;
    particles = [];
    context.clearRect(0, 0, width, height);
  }

  function update() {
    if (!playing || document.hidden || motion.matches) stop();
    else if (frame === undefined) frame = requestAnimationFrame(tick);
  }

  document.addEventListener('visibilitychange', update, { signal });
  motion.addEventListener('change', update, { signal });
  signal.addEventListener('abort', stop, { once: true });
  return active => {
    playing = active;
    update();
  };
}
