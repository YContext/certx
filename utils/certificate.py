from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def build_certificate(template_path: Path, participant_name: str, title: str, description: str, signatory: str, certificate_date: str, output_path: Path):
    """Create a certificate image using a PNG template or a simple generated layout for other types.

    Saves PNG to `output_path`.
    """
    template_path = Path(template_path)
    ext = template_path.suffix.lower()

    supported = [".png", ".jpg", ".jpeg", ".webp"]

    if not template_path.exists():
        print(f"WARNING: template not found at '{template_path.resolve()}' -> using blank white background")
        base = Image.new('RGBA', (1400, 900), (255, 255, 255))
    elif ext not in supported:
        print(f"WARNING: template extension '{ext}' not supported ({supported}) -> using blank white background")
        base = Image.new('RGBA', (1400, 900), (255, 255, 255))
    else:
        base = Image.open(template_path).convert("RGBA")
        print(f"Loaded template '{template_path}' size={base.size}")

    draw = ImageDraw.Draw(base)
    w, h = base.size

    # Font sizes scale with the template's own height, so layout adapts to any
    # template resolution instead of assuming a fixed 1400x900 canvas.
    scale = h / 900
    def px(base_size):
        return max(10, int(base_size * scale))

    try:
        title_font = ImageFont.truetype("arial.ttf", px(60))
        name_font = ImageFont.truetype("arial.ttf", px(72))
        body_font = ImageFont.truetype("arial.ttf", px(34))
        small_font = ImageFont.truetype("arial.ttf", px(28))
    except Exception:
        title_font = ImageFont.load_default()
        name_font = ImageFont.load_default()
        body_font = ImageFont.load_default()
        small_font = ImageFont.load_default()

    # All positions below are fractions of (w, h) rather than fixed pixels,
    # so they land in sensible spots regardless of the template's actual size.

    # Title
    draw.text(
        (w * 0.5, h * 0.12),
        title.upper(),
        fill=(40,40,40),
        font=title_font,
        anchor="mm"
    )

    # Participant Name
    draw.text(
        (w * 0.5, h * 0.38),
        participant_name,
        fill=(30,35,95),
        font=name_font,
        anchor="mm"
    )

    # Description
    draw.multiline_text(
        (w * 0.5, h * 0.51),
        description,
        fill=(60,60,60),
        font=body_font,
        anchor="mm",
        align="center"
    )

    # Date
    draw.text(
        (w * 0.37, h * 0.8),
        certificate_date,
        fill="black",
        font=small_font,
        anchor="mm"
    )

    # Signature
    draw.text(
        (w * 0.69, h * 0.8),
        signatory,
        fill="black",
        font=small_font,
        anchor="mm"
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    base.save(output_path)
    return output_path
