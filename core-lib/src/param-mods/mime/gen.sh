curl -s -O https://raw.githubusercontent.com/broofa/mime/master/types/standard.js
node gen > mime-data.ts
rm standard.js