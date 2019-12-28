for f in *.jp*; do mv -n "$f" "${f/*/$RANDOM.jpg}"; done
montage -mode concatenate -geometry 400x400^ -gravity center -extent 400x400 -tile 10x6 *.jp* ../poster.jpg
