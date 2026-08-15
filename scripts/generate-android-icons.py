from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "Search-dark.png"
ANDROID_RES = ROOT / "src-tauri" / "gen" / "android" / "app" / "src" / "main" / "res"
ICON_RES = ROOT / "src-tauri" / "icons" / "android"

DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def rounded(img: Image.Image, radius: float) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radius=radius, fill=255)
    out = img.copy()
    out.putalpha(mask)
    return out


def make_launcher(mark: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (9, 9, 11, 255))
    # Keep a little padding so the S isn't clipped by Android's adaptive mask.
    inner = int(size * 0.72)
    logo = mark.resize((inner, inner), Image.Resampling.LANCZOS)
    x = (size - inner) // 2
    canvas.alpha_composite(logo, (x, x))
    return rounded(canvas, size * 0.22)


def make_foreground(mark: Image.Image, size: int) -> Image.Image:
    # Adaptive icons use a 108dp canvas; safe zone is the inner 66/108.
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = int(size * 0.52)
    logo = mark.resize((inner, inner), Image.Resampling.LANCZOS)
    x = (size - inner) // 2
    canvas.alpha_composite(logo, (x, x))
    return canvas


def write_set(base: Path, name: str, img: Image.Image) -> None:
    base.mkdir(parents=True, exist_ok=True)
    img.save(base / name, "PNG")


def main() -> None:
    mark = Image.open(SRC).convert("RGBA")
    for folder, size in DENSITIES.items():
        launcher = make_launcher(mark, size)
        foreground = make_foreground(mark, int(size * 108 / 48))
        for root in (ANDROID_RES, ICON_RES):
            write_set(root / folder, "ic_launcher.png", launcher)
            write_set(root / folder, "ic_launcher_round.png", launcher)
            write_set(root / folder, "ic_launcher_foreground.png", foreground)

    # Keep desktop/source icons in sync with the public mark.
    (ROOT / "src-tauri" / "icons").mkdir(parents=True, exist_ok=True)
    mark.resize((512, 512), Image.Resampling.LANCZOS).save(ROOT / "src-tauri" / "icons" / "icon.png", "PNG")
    print("Wrote Stream launcher icons from public/Search-dark.png")


if __name__ == "__main__":
    main()
