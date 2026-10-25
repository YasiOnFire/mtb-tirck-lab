import argparse
import copy
import json
import math
import struct
import zlib
from functools import lru_cache
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "artifacts/asset-research/source/Superhero_Male_FullBody.gltf"
OUTPUT = ROOT / "public/assets/rider/base-rider.glb"
COMPONENTS = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
FINGERS = ("thumb_", "index_", "middle_", "ring_", "pinky_")


def read_accessor(document, binary, index):
    accessor = document["accessors"][index]
    view = document["bufferViews"][accessor["bufferView"]]
    format_string = "<" + COMPONENTS[accessor["componentType"]] * WIDTHS[accessor["type"]]
    stride = view.get("byteStride", struct.calcsize(format_string))
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [list(struct.unpack_from(format_string, binary, offset + item * stride)) for item in range(accessor["count"])]


def unit(vector):
    length = math.sqrt(sum(component * component for component in vector))
    return [component / length for component in vector] if length > 1e-12 else [0.0, 1.0, 0.0]


@lru_cache(maxsize=32)
def linear(hex_color):
    values = [int(hex_color[index:index + 2], 16) / 255 for index in (0, 2, 4)]
    return [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in values]


def hand(name):
    return name.startswith("hand_") or name.startswith(FINGERS)


def foot(name):
    return name.startswith(("foot_", "ball_"))


def cloth_weight(position, bone):
    if bone == "Head" or hand(bone) or foot(bone):
        return 0.0
    if bone == "neck_01":
        return max(0.0, min(1.0, (1.565 - position[1]) / 0.035))
    return 1.0


def cloth_color(position, bone):
    x, y, z = position
    side = abs(x)
    if bone == "Head" or (bone == "neck_01" and y > 1.557):
        return linear("b9896c")
    if hand(bone) or foot(bone):
        return linear("15151b")
    if y < 1.015:
        color = "202129"
        if 0.36 < y < 0.58 and z > -0.075:
            color = "30313a"
        if 0.64 < y < 0.92 and side > 0.148:
            color = "5918df"
        if y > 0.97 or y < 0.135:
            color = "15151c"
    else:
        color = "282930"
        if (1.37 < y < 1.56 and 0.155 < side < 0.32) or (0.385 < side < 0.445 and y > 1.33):
            color = "5918df"
        if side < 0.22 and z > 0.012 and abs(y - 1.355) < 0.013:
            color = "c8c4bb"
        if side > 0.65 or y < 1.055:
            color = "15151c"
    fabric = 1.0 + 0.022 * math.sin(x * 231 + y * 107) * math.sin(z * 193 - y * 83)
    return [min(1.0, max(0.0, component * fabric)) for component in linear(color)]


def prepare_surface(positions, normals, indices, bone_names):
    welds = {}
    keys = []
    representatives = []
    original_to_weld = []
    for index, position in enumerate(positions):
        key = tuple(round(value, 6) for value in position)
        if key not in welds:
            welds[key] = len(keys)
            keys.append(key)
            representatives.append(index)
        original_to_weld.append(welds[key])
    adjacency = [set() for _ in keys]
    for offset in range(0, len(indices), 3):
        triangle = [original_to_weld[index] for index in indices[offset:offset + 3]]
        for first in range(3):
            adjacency[triangle[first]].update(triangle[j] for j in range(3) if j != first and triangle[j] != triangle[first])
    surface = [positions[index][:] for index in representatives]
    weights = [cloth_weight(positions[index], bone_names[index]) for index in representatives]
    welded_normals = [[0.0, 0.0, 0.0] for _ in keys]
    for index, normal in enumerate(normals):
        for axis in range(3):
            welded_normals[original_to_weld[index]][axis] += normal[axis]
    welded_normals = [unit(normal) for normal in welded_normals]
    for _ in range(7):
        next_surface = []
        for index, point in enumerate(surface):
            neighbors = adjacency[index]
            amount = weights[index] * 0.32
            if not neighbors or amount == 0:
                next_surface.append(point[:])
                continue
            average = [sum(surface[neighbor][axis] for neighbor in neighbors) / len(neighbors) for axis in range(3)]
            next_surface.append([point[axis] + (average[axis] - point[axis]) * amount for axis in range(3)])
        surface = next_surface
    updated = []
    for index, original in enumerate(positions):
        welded = original_to_weld[index]
        weight = weights[welded]
        bone = bone_names[index]
        if weight == 0:
            updated.append(original[:])
            continue
        amount = 0.022 if original[1] < 1.03 else 0.014
        if "arm" in bone:
            amount = 0.010
        updated.append([surface[welded][axis] + welded_normals[welded][axis] * amount * weight for axis in range(3)])
    smoothed_normals = [[0.0, 0.0, 0.0] for _ in keys]
    for offset in range(0, len(indices), 3):
        a, b, c = indices[offset:offset + 3]
        u = [updated[b][axis] - updated[a][axis] for axis in range(3)]
        v = [updated[c][axis] - updated[a][axis] for axis in range(3)]
        cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        for index in (a, b, c):
            welded = original_to_weld[index]
            for axis in range(3):
                smoothed_normals[welded][axis] += cross[axis]
    updated_normals = [unit(smoothed_normals[original_to_weld[index]]) if cloth_weight(positions[index], bone_names[index]) > 0 else normals[index][:] for index in range(len(positions))]
    colors = [cloth_color(position, bone) for position, bone in zip(positions, bone_names)]
    removable = [(hand(bone) and abs(position[0]) > 0.713) or (foot(bone) and position[1] < 0.09) for position, bone in zip(positions, bone_names)]
    retained_indices = []
    for offset in range(0, len(indices), 3):
        triangle = indices[offset:offset + 3]
        if not all(removable[index] for index in triangle):
            retained_indices.extend(triangle)
    return updated, updated_normals, colors, retained_indices


def fabric_texture(positions, coordinates, indices, bone_names, size=1024):
    pixels = bytearray([24, 22, 30] * size * size)
    painted = bytearray(size * size)
    for start in range(0, len(indices), 3):
        vertices = indices[start:start + 3]
        triangle = [[coordinates[index][axis] * (size - 1) for axis in range(2)] for index in vertices]
        a, b, c = triangle
        denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(denominator) < 1e-9:
            continue
        left, right = max(0, math.floor(min(p[0] for p in triangle))), min(size - 1, math.ceil(max(p[0] for p in triangle)))
        top, bottom = max(0, math.floor(min(p[1] for p in triangle))), min(size - 1, math.ceil(max(p[1] for p in triangle)))
        for y in range(top, bottom + 1):
            for x in range(left, right + 1):
                first = ((b[1] - c[1]) * (x + 0.5 - c[0]) + (c[0] - b[0]) * (y + 0.5 - c[1])) / denominator
                second = ((c[1] - a[1]) * (x + 0.5 - c[0]) + (a[0] - c[0]) * (y + 0.5 - c[1])) / denominator
                third = 1 - first - second
                if min(first, second, third) < -0.0001:
                    continue
                barycentric = [first, second, third]
                position = [sum(positions[vertices[i]][axis] * barycentric[i] for i in range(3)) for axis in range(3)]
                bone = bone_names[vertices[max(range(3), key=lambda i: barycentric[i])]]
                color = cloth_color(position, bone)
                weave = 1.0 if bone == "Head" or bone == "neck_01" else (0.975 if (x + y) % 2 else 1.025)
                srgb = [round(255 * max(0.0, min(1.0, (value * 12.92 if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055) * weave))) for value in color]
                pixel = y * size + x
                pixels[pixel * 3:pixel * 3 + 3] = bytes(srgb)
                painted[pixel] = 1
    for _ in range(4):
        previous = painted[:]
        for pixel in range(size * size):
            if previous[pixel]:
                continue
            for neighbor in (pixel - 1, pixel + 1, pixel - size, pixel + size):
                if 0 <= neighbor < size * size and previous[neighbor]:
                    pixels[pixel * 3:pixel * 3 + 3] = pixels[neighbor * 3:neighbor * 3 + 3]
                    painted[pixel] = 1
                    break
    rows = b"".join(b"\0" + pixels[y * size * 3:(y + 1) * size * 3] for y in range(size))
    def chunk(name, content):
        return struct.pack(">I", len(content)) + name + content + struct.pack(">I", zlib.crc32(name + content) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")


def build(source, destination):
    original = json.loads(source.read_text(encoding="utf-8"))
    source_binary = (source.parent / original["buffers"][0]["uri"]).read_bytes()
    document = copy.deepcopy(original)
    source_joint_names = [original["nodes"][node]["name"] for node in original["skins"][0]["joints"]]
    binary = bytearray()
    new_views, new_accessors = [], []
    accessor_map = {}

    def append(values, source_accessor=None, kind=None, component_type=None, normalized=False, bounds=False, target=None):
        template = original["accessors"][source_accessor] if source_accessor is not None else {}
        kind = kind or template["type"]
        component_type = component_type or template["componentType"]
        normalized = template.get("normalized", normalized)
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        format_string = "<" + COMPONENTS[component_type] * WIDTHS[kind]
        for value in values:
            binary.extend(struct.pack(format_string, *value))
        view = {"buffer": 0, "byteOffset": offset, "byteLength": len(binary) - offset}
        if target:
            view["target"] = target
        new_views.append(view)
        accessor = {"bufferView": len(new_views) - 1, "componentType": component_type, "count": len(values), "type": kind}
        if normalized:
            accessor["normalized"] = True
        if bounds or "min" in template:
            accessor["min"] = [min(value[axis] for value in values) for axis in range(WIDTHS[kind])]
            accessor["max"] = [max(value[axis] for value in values) for axis in range(WIDTHS[kind])]
        new_accessors.append(accessor)
        return len(new_accessors) - 1

    def copy_accessor(index, target=None):
        if index not in accessor_map:
            accessor_map[index] = append(read_accessor(original, source_binary, index), index, target=target)
        return accessor_map[index]

    statistics = {}
    texture = None
    for mesh_index, mesh in enumerate(document["meshes"]):
        for primitive in mesh["primitives"]:
            attributes = primitive["attributes"]
            positions = read_accessor(original, source_binary, attributes["POSITION"])
            normals = read_accessor(original, source_binary, attributes["NORMAL"])
            indices = [item[0] for item in read_accessor(original, source_binary, primitive["indices"])]
            original_index_count = len(indices)
            colors = None
            if mesh_index == 2:
                joints = read_accessor(original, source_binary, attributes["JOINTS_0"])
                weights = read_accessor(original, source_binary, attributes["WEIGHTS_0"])
                names = [source_joint_names[joint[max(range(4), key=lambda i: weight[i])]] for joint, weight in zip(joints, weights)]
                texture = fabric_texture(positions, read_accessor(original, source_binary, attributes["TEXCOORD_0"]), indices, names)
                positions, normals, colors, indices = prepare_surface(positions, normals, indices, names)
                statistics = {"vertices": len(positions), "sourceTriangles": original_index_count // 3, "triangles": len(indices) // 3, "removedHandFootTriangles": (original_index_count - len(indices)) // 3, "bones": len(source_joint_names)}
            next_attributes = {
                "POSITION": append(positions, attributes["POSITION"], bounds=True, target=34962),
                "NORMAL": append(normals, attributes["NORMAL"], target=34962),
                "JOINTS_0": copy_accessor(attributes["JOINTS_0"], target=34962),
                "WEIGHTS_0": copy_accessor(attributes["WEIGHTS_0"], target=34962),
            }
            if colors is not None:
                next_attributes["TEXCOORD_0"] = copy_accessor(attributes["TEXCOORD_0"], target=34962)
            primitive["attributes"] = next_attributes
            primitive["indices"] = append([[index] for index in indices], primitive["indices"], target=34963)
    for skin in document["skins"]:
        skin["inverseBindMatrices"] = copy_accessor(skin["inverseBindMatrices"])
    document["materials"] = [
        {"name": "MTB_Brows", "doubleSided": True, "pbrMetallicRoughness": {"baseColorFactor": [*linear("242126"), 1], "metallicFactor": 0, "roughnessFactor": 0.9}},
        {"name": "MTB_Eyes", "doubleSided": True, "pbrMetallicRoughness": {"baseColorFactor": [*linear("d3c8bc"), 1], "metallicFactor": 0, "roughnessFactor": 0.6}},
        {"name": "MTB_Kit_ProceduralFabric", "doubleSided": False, "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 0.94}},
    ]
    for key in ("textures", "images", "samplers"):
        document.pop(key, None)
    while len(binary) % 4:
        binary.append(0)
    texture_offset = len(binary)
    binary.extend(texture)
    new_views.append({"buffer": 0, "byteOffset": texture_offset, "byteLength": len(texture)})
    document["images"] = [{"bufferView": len(new_views) - 1, "mimeType": "image/png", "name": "MTB_ProceduralFabric"}]
    document["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
    document["textures"] = [{"source": 0, "sampler": 0}]
    document["accessors"] = new_accessors
    document["bufferViews"] = new_views
    document["buffers"] = [{"byteLength": len(binary)}]
    document["asset"]["copyright"] = "Base character by Quaternius, CC0 1.0. Procedural MTB clothing adaptation for MTB Trick Lab."
    document["asset"]["generator"] = "MTB Trick Lab prepare-rider.py"
    document["extras"] = {"source": "Quaternius Universal Base Characters Kit / Superhero_Male_FullBody", "license": "CC0-1.0", "adaptation": "Cloth surface smoothing and offset, procedurally rasterized embedded MTB fabric, wrist/ankle cutoffs. Original bones, skin weights, bind matrices and face geometry preserved.", **statistics}
    assert document["nodes"] == original["nodes"], "Bone transforms or mesh node bindings changed"
    for before, after in zip(original["skins"], document["skins"]):
        assert before["joints"] == after["joints"], "Joint order changed"
        assert read_accessor(original, source_binary, before["inverseBindMatrices"]) == read_accessor(document, binary, after["inverseBindMatrices"]), "Inverse bind matrices changed"
    for before_mesh, after_mesh in zip(original["meshes"], document["meshes"]):
        for before, after in zip(before_mesh["primitives"], after_mesh["primitives"]):
            for attribute in ("JOINTS_0", "WEIGHTS_0"):
                assert read_accessor(original, source_binary, before["attributes"][attribute]) == read_accessor(document, binary, after["attributes"][attribute]), f"Skinning {attribute} changed"
    encoded = json.dumps(document, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    encoded += b" " * ((4 - len(encoded) % 4) % 4)
    binary.extend(b"\0" * ((4 - len(binary) % 4) % 4))
    glb = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(encoded) + 8 + len(binary))
    glb += struct.pack("<I4s", len(encoded), b"JSON") + encoded
    glb += struct.pack("<I4s", len(binary), b"BIN\0") + binary
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_bytes(glb)
    temporary.replace(destination)
    print(json.dumps({"output": str(destination), "bytes": len(glb), **statistics}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    arguments = parser.parse_args()
    build(arguments.source.resolve(), arguments.output.resolve())
