rm poster.jpeg
montage -mode concatenate -background white -geometry 400x400^ -geometry +2+2 -gravity north -extent 400x500 -tile 6x6 *.jp* - | convert - -trim poster.jpeg
