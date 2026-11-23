"""Bake three looping, transparent plasma orbs for the streaming text overlay."""

from pathlib import Path
from math import tau

import numpy as np
from PIL import Image


SIZE, FRAMES, COLUMNS = 128, 36, 6
PALETTES = (
    ('#145bff', '#20c6ff', '#8bf5ff', '#e4ffff'),
    ('#b50738', '#ff233b', '#ff7570', '#fff4df'),
    ('#4221dc', '#9862ff', '#fd82f9', '#fff1ff'),
)
axis = (np.arange(SIZE, dtype=np.float32) + .5 - SIZE / 2) / (SIZE / 2)
X, Y = np.meshgrid(axis, axis)
R = np.hypot(X, Y)
A = np.arctan2(Y, X)


def gauss(value, width):
    return np.exp(-np.square(value / width))


def rgb(color):
    return np.array([int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def render(phase, palette):
    alpha = np.zeros_like(R)
    pixel = np.zeros((*R.shape, 3), np.float32)
    outer, plasma, hot, white = map(rgb, palette)

    def layer(strength, color):
        strength = np.clip(strength, 0, 1)
        pixel[:] = pixel * (1 - strength[..., None]) + color * strength[..., None]
        alpha[:] = strength + alpha * (1 - strength)

    # Twisted plasma between the nucleus and a broken, moving orbital rim.
    warp = (
        .19 * np.sin(4 * A + 11 * R - 2 * phase)
        + .10 * np.sin(9 * A - 17 * R + 3 * phase)
        + .07 * np.sin(18 * A + 28 * R - 4 * phase)
    )
    angle = A + warp
    edge = .55 + .013 * np.sin(5 * A + phase) + .009 * np.sin(9 * A - 2 * phase)
    volume = np.clip((edge + .03 - R) / .15, 0, 1)
    fog = .5 + .24 * np.sin(5 * angle + 19 * R - 2 * phase) + .22 * np.cos(9 * angle - 14 * R + 2 * phase)
    layer(.28 * gauss(R, .65) * np.clip((.97 - R) / .32, 0, 1), outer)
    layer(.8 * volume * (.38 + .62 * fog), plasma)
    web = gauss(np.sin(9 * angle + 21 * R - 3 * phase), .32)
    layer(.58 * volume * web * gauss(R - .31, .27), hot)
    for index in range(6):
        tilt = A + phase * (1 if index % 2 else -1) + index * .69
        # Each current crosses a different latitude on the plasma shell.
        radius = (
            edge - index * .032 + .036 * np.cos(2 * (A + index * .51))
            + .017 * np.sin(4 * tilt) + .009 * np.sin(13 * tilt)
        )
        fade = (.5 + .5 * np.cos(tilt + index)) ** 2
        break_up = (.6 + .4 * np.cos(7 * tilt + 6 * R)) * fade
        layer(gauss(R - radius, .03) * (.16 + .73 * fade), plasma)
        layer(gauss(R - radius, .010) * break_up * .88, hot)
        layer(gauss(R - radius, .006) * break_up ** 2 * .81, white)

    # Core blooms in pulses. A few plasma tendrils stay sharp through the bloom.
    nucleus = np.hypot(X + .04 + .023 * np.cos(phase), Y - .025 * np.sin(2 * phase))
    pulse = .96 + .13 * np.sin(2 * phase) + .09 * np.cos(5 * phase)
    layer(.83 * gauss(nucleus, .29 * pulse), hot)
    layer(.98 * gauss(nucleus, .152 * pulse), white)
    for index in range(3):
        electric = gauss(np.sin(3 * angle + R * (6 + index) - phase + index * .6), .13)
        layer(electric * gauss(nucleus - .22 - index * .07, .13) * .7, white)

    # Moving sparks and a restrained diagonal lens streak.
    for index in range(13):
        age = (phase / tau + index * .381966) % 1
        theta = index * 2.39996 + .69 * age + .12 * np.sin(phase)
        distance = .43 + .48 * age
        along = X * np.cos(theta) + Y * np.sin(theta) - distance
        across = Y * np.cos(theta) - X * np.sin(theta)
        spark = gauss(along, .028 + .047 * age) * gauss(across, .010 + .007 * (1 - age))
        layer(spark * np.sin(np.pi * age) ** 1.4 * .83, white if index % 3 == 0 else hot)
    sweep = gauss(Y + .13 * X, .025) * gauss(X, .61) * (.09 + .07 * pulse)
    layer(sweep, hot)
    layer(.43 * gauss(nucleus, .054), np.ones(3))

    straight = pixel / np.maximum(alpha[..., None], 1e-6)
    rgba = np.dstack((straight, alpha))
    return Image.fromarray(np.uint8(np.rint(np.clip(rgba, 0, 1) * 255)))


def main():
    rows = FRAMES // COLUMNS
    atlas = Image.new('RGBA', (COLUMNS * SIZE, rows * SIZE * len(PALETTES)))
    for spell, palette in enumerate(PALETTES):
        for frame in range(FRAMES):
            orb = render(tau * frame / FRAMES, palette)
            atlas.paste(orb, ((frame % COLUMNS) * SIZE, (spell * rows + frame // COLUMNS) * SIZE))
    destination = Path(__file__).resolve().parents[1] / 'assets/workbench/stream-orbs.webp'
    atlas.save(destination, 'WEBP', quality=88, alpha_quality=97, method=6)


if __name__ == '__main__':
    main()
