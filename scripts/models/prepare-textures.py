from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / 'artifacts' / 'import-character'
SOURCE = ROOT / 'source/Realistic Male 3D Character Model/Realistic Male 3D Character Model.fbm'
for name, source in [('diffuse', 'Material_001_Pbr_Diffuse.jpg'), ('normal', 'Material_001_Pbr_Normal.jpg')]:
    image = Image.open(SOURCE / source).convert('RGB').resize((2048, 2048), Image.Resampling.LANCZOS)
    # Match the original Three FBX TextureLoader flipY=true upload when these
    # bytes are embedded in glTF, whose loader uses flipY=false.
    image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    image.save(ROOT / f'{name}-2k.jpg', quality=91, subsampling=0, optimize=True)
    print(name, (ROOT / f'{name}-2k.jpg').stat().st_size)
