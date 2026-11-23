from pathlib import Path
from PIL import Image

folder = Path(__file__).resolve().parents[1] / '.local' / 'screens'
for name in ('overview', 'experiments', 'solar', 'coating', 'greenhouse', 'log', 'system', 'log-mobile'):
    source = folder / f'{name}.png'
    if not source.exists():
        continue
    with Image.open(source) as image:
        width, height = image.size
        crop = image.crop((0, 0, width, min(height, 1100)))
        crop.thumbnail((900, 750))
        crop.convert('RGB').save(folder / f'{name}-preview.jpg', quality=72, optimize=True)
        print(name, width, height, (folder / f'{name}-preview.jpg').stat().st_size)
