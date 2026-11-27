"""Rendert vier Blüten-Varianten für das Blütenfeld auf der Startseite.

Aufruf (Blender im Hintergrund, ohne Fenster):
  blender -b --factory-startup -P tools/blender/flower.py -- <ausgabeordner>

Jede Blüte: fünf (oder sechs) gewölbte Blütenblätter und ein kleines Herz,
weißes, leicht durchscheinendes Material, von oben gerendert mit transparentem
Hintergrund. Die Farbe bekommt jede Blüte später im Shader auf der Website.
"""
import math
import os
import sys

import bpy

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "."
SIZE = 256

# Varianten: (Anzahl Blätter, Wölbung nach oben, Blattbreite, Drehung des Blatts)
VARIANTS = [
    (5, 0.18, 0.24, 0.00),
    (5, 0.30, 0.28, 0.10),
    (6, 0.22, 0.20, 0.05),
    (5, 0.10, 0.30, -0.08),
]


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = SIZE
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.02, 0.03, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    scene.world = world
    return scene


def material(name, colour, subsurface=0.0, roughness=0.45):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    for key in ("Subsurface Weight", "Subsurface"):  # Name hängt von der Blender-Version ab
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = subsurface
            break
    for key in ("Sheen Weight", "Sheen"):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = 0.4
            break
    return mat


def petal(angle, curl, width, twist, mat):
    """Ein Blütenblatt: abgeflachte Kugel, nach außen geschoben und an der Spitze nach oben gebogen"""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1)
    obj = bpy.context.active_object
    obj.scale = (width, 0.5, 0.045)
    bpy.ops.object.transform_apply(scale=True)
    # Spitze anheben (Wölbung) und Basis schmaler machen
    for v in obj.data.vertices:
        t = (v.co.y + 0.5)  # 0 an der Basis, 1 an der Spitze
        v.co.z += curl * t * t
        v.co.x *= 0.55 + 0.45 * math.sin(min(1.0, t) * math.pi * 0.85)
    obj.location = (0, 0.52, 0)
    bpy.ops.object.transform_apply(location=True)
    obj.rotation_euler = (0, twist, angle)
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return obj


def build_flower(count, curl, width, twist):
    white = material("Blatt", (0.95, 0.95, 0.97), subsurface=0.25)
    heart = material("Herz", (1.0, 0.93, 0.78), roughness=0.6)
    for k in range(count):
        petal(k / count * math.tau, curl, width, twist, white)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, location=(0, 0, 0.05))
    bpy.context.active_object.data.materials.append(heart)
    bpy.ops.object.shade_smooth()


def lights_and_camera():
    bpy.ops.object.light_add(type="SUN", rotation=(math.radians(35), math.radians(-25), 0))
    bpy.context.active_object.data.energy = 3.2
    bpy.ops.object.light_add(type="AREA", location=(-2, 2, 3))
    fill = bpy.context.active_object
    fill.data.energy = 120
    fill.data.size = 3
    bpy.ops.object.camera_add(location=(0, -0.35, 4), rotation=(math.radians(5), 0, 0))
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 2.35
    bpy.context.scene.camera = cam


os.makedirs(OUT, exist_ok=True)
for i, (count, curl, width, twist) in enumerate(VARIANTS):
    scene = reset_scene()
    build_flower(count, curl, width, twist)
    lights_and_camera()
    scene.render.filepath = os.path.join(OUT, f"flower_{i}.png")
    bpy.ops.render.render(write_still=True)
    print("gerendert:", scene.render.filepath)
