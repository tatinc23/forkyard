#!/bin/bash
# usage: sheet.sh <stillsDir> <out.png> <cols> <tileW>
d="$1"; out="$2"; cols="${3:-4}"; tw="${4:-480}"
n=$(ls "$d"/t*.png | wc -l | tr -d ' '); rows=$(( (n + cols - 1) / cols ))
/usr/local/bin/ffmpeg -loglevel error -y -pattern_type glob -i "$d/t*.png" -vf "scale=${tw}:-1,tile=${cols}x${rows}:padding=6:color=0x888888" -frames:v 1 "$out"
