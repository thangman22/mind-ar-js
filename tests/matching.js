const fs = require('fs');
const {Image} = require('image-js');
const path = require('path');
const {kpmExtract} = require('../lib/features/kpm.js');
const {build: clusteringBuild} = require('../lib/features/clustering.js');
const {debugImageData} = require('../lib/utils/debug.js');

const DEBUG = true;
let debugContent = null;
if (DEBUG) {
  debugContent = JSON.parse(fs.readFileSync("/Users/hiukim/Downloads/debugMatching.txt", 'utf8'));
}

const DEFAULT_DPI = 72;
const MIN_IMAGE_PIXEL_SIZE = 28;
const EPSILON = 0.01;
const INPUT_FILE = 'card';

//console.log("ref data set: ", debugContent.refsets);

// image: Imagejs.Image
const getGreyImage = (image) => {
  const _greyImage = image.grey({algorithm: "average"});

  const greyImage = {
    width: _greyImage.width,
    height: _greyImage.height,
    data: []
  };
  for (let i = 0; i < _greyImage.data.length; i++) {
    greyImage.data.push( Math.floor(_greyImage.data[i] / _greyImage.maxValue * 255));
  }
  return greyImage;
}

const resizeImage = (image, ratio) => {
  const width = Math.round(image.width * ratio);
  const height = Math.round(image.height * ratio);

  const imageData = new Uint8Array(width * height);
  for (let i = 0; i < width; i++) {
    let si1 = Math.round(1.0 * i / ratio);
    let si2 = Math.round(1.0 * (i+1) / ratio) - 1;
    if (si2 >= image.width) si2 = image.width - 1;

    for (let j = 0; j < height; j++) {
      let sj1 = Math.round(1.0 * j / ratio);
      let sj2 = Math.round(1.0 * (j+1) / ratio) - 1;
      if (sj2 >= image.height) sj2 = image.height - 1;

      let sum = 0;
      let count = 0;
      for (let ii = si1; ii <= si2; ii++) {
        for (let jj = sj1; jj <= sj2; jj++) {
          sum += (1.0 * image.data[jj * image.width + ii]);
          count += 1;
        }
      }
      imageData[j * width + i] = Math.floor(sum / count);
    }
  }
  return {data: imageData, width: width, height: height};
}

const exec = async() => {
  var _start = new Date().getTime();

  const imagePath = path.join(__dirname, INPUT_FILE + '.png');
  const image = await new Promise((resolve, reject) => {
    Image.load(imagePath).then((image) => {
      resolve(image);
    });
  });
  const greyImage = getGreyImage(image);

  const dpi = DEFAULT_DPI;
  const minDpi = Math.floor(1.0 * MIN_IMAGE_PIXEL_SIZE / Math.min(greyImage.width, greyImage.height) * dpi * 1000) / 1000;

  const dpiList = [];
  let c = minDpi;
  while (true) {
    dpiList.push(c);
    c *= Math.pow(2.0, 1.0/3.0);
    c = Math.fround(c); // can remove this line in production. trying to reproduce the same result as artoolkit, which use float.
    if (c >= dpi * 0.95) {
      c = dpi;
      break;
    }
  }
  dpiList.push(c);
  dpiList.reverse();

  console.log("dpi list: ", dpiList);

  const imageList = []; // list of {data: Uint8Array[width x height], width, height}
  for (let i = 0; i < dpiList.length; i++) {
    const w = greyImage.width * dpiList[i] / dpi;
    const h = greyImage.height * dpiList[i] / dpi;
    imageList.push( resizeImage(greyImage, dpiList[i]/dpi) );
  }

  for (let i = 0; i < imageList.length; i++) {
    const image = imageList[i];
    const points = kpmExtract({imageData: image.data, width: image.width, height: image.height, dpi: dpiList[i], pageNo: 1, imageNo: i});

    console.log('points length', i, points.length, debugContent.refsets[i].points.length);
    for (let j = 0; j < points.length; j++) {
      const p1 = points[j];
      const p2 = debugContent.refsets[i].points[j];

      const vs = [];
      for (let j = 0; j < 96; j++) vs.push(0);

      for (let j = 0; j < p1.descriptors.length; j+=8) {
        let v = 0;
        for (let k = 0; k < 8; k++) {
          if (p1.descriptors[j+k]) {
            v = v + (1 << k);
          }
        }
        vs[j/8] = v;
      }
      //console.log(JSON.stringify(vs), 'vs', JSON.stringify(p2.descriptors));
      //console.log('x:', p1.x2D, p2.x2d, 'y:', p1.y2D, p2.y2d, 'scale:', p1.scale, p2.scale, 'angle:', p1.angle, p2.angle, 'maxima:', p1.maxima, p2.maxima);
    }

    const clusters = clusteringBuild({points: points});
    console.log(JSON.stringify(clusters));
    console.log(debugContent.clusters[i]);
    break;
  }
}
exec();

return;

console.log("test matching");
const inputImage = debugContent.inputImage;

console.log("input :", inputImage.width, inputImage.height, inputImage.values.length);

console.log("inDataSet: ", debugContent.inDataSet);

console.log("debug points: ", debugContent.points.length);

const image = {
  data: inputImage.values,
  width: inputImage.width,
  height: inputImage.height
}