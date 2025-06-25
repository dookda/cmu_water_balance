
// =================================================================================
// Part 1: Basic Setup and Input Data
// =================================================================================

var aoi = ee.Geometry.Rectangle([98.5, 18.0, 99.5, 19.5]);
Map.centerObject(aoi, 9);

var startDate = '2022-01-01';
var endDate = '2022-12-31';

var lulc = ee.Image('ESA/WorldCover/v200/2021').select('Map').clip(aoi);

var soilTexture = ee.Image('OpenLandMap/SOL/SOL_TEXTURE-CLASS_USDA-TT_M/v02')
                   .select('b0')
                   .clip(aoi)
                   .rename('soil_texture');

var precipitation = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
                     .filterDate(ee.Date(startDate).advance(-5, 'day'), endDate)
                     .select('precipitation')
                     .map(function(image) {
                       return image.rename('p').copyProperties(image, ['system:time_start']);
                     });

var lulcVisParams = {
  min: 10, max: 95,
  palette: ['006400', 'ffbb22', 'ffff4c', 'f096ff', 'fa0000', 'b4b4b4', 'f0f0f0', '0064c8', '0096a0', '00cf75']
};
Map.addLayer(lulc, lulcVisParams, 'ESA WorldCover LULC');
Map.addLayer(soilTexture, {min: 1, max: 12, palette: ['d5c36b', 'b96947', '9d3722', '74281a']}, 'Soil Texture');

var precipitationVis = {
  min: 0,
  max: 1,
  palette: ['001137', '0aab1e', 'e7eb05', 'ff4a2d', 'e90000'],
};
Map.addLayer(precipitation.median().clip(aoi), precipitationVis, 'Precipitation');

// =================================================================================
// Part 2: Hydrologic Parameters
// =================================================================================

var hsg = soilTexture.remap(
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  [4, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1],
  4
).rename('hsg');

var cnLookup = {
  10: [55, 70, 80, 85],
  20: [48, 66, 77, 83],
  30: [61, 74, 82, 86],
  40: [67, 78, 85, 89],
  50: [75, 85, 90, 92],
  60: [86, 91, 94, 96],
  70: [98, 98, 98, 98],
  80: [100, 100, 100, 100],
  90: [100, 100, 100, 100],
  95: [55, 70, 80, 85]
};

var cn2 = ee.Image(0).clip(aoi);
var lulcClasses = Object.keys(cnLookup).map(Number);
lulcClasses.forEach(function(lc) {
  var cnValues = cnLookup[lc];
  var cnImage = hsg.expression(
    "(hsg == 1) ? ca : (hsg == 2) ? cb : (hsg == 3) ? cc : cd",
    {hsg: hsg, ca: cnValues[0], cb: cnValues[1], cc: cnValues[2], cd: cnValues[3]}
  );
  cn2 = cn2.where(lulc.eq(lc), cnImage);
});
cn2 = cn2.rename('cn2');

var cn1 = cn2.expression('(4.2 * CN2) / (10 - 0.058 * CN2)', {'CN2': cn2}).rename('cn1');
var cn3 = cn2.expression('(23 * CN2) / (10 + 0.13 * CN2)', {'CN2': cn2}).rename('cn3');

var s1 = cn1.expression('(25400 / CN1) - 254', {'CN1': cn1}).rename('s1');
var s2 = cn2.expression('(25400 / CN2) - 254', {'CN2': cn2}).rename('s2');
var s3 = cn3.expression('(25400 / CN3) - 254', {'CN3': cn3}).rename('s3');

var cnVis = {min: 30, max: 100, palette: ['green', 'yellow', 'red', 'purple']};
Map.addLayer(cn2, cnVis, 'Curve Number (CN-II)');

// =================================================================================
// Part 3: Runoff Calculation
// =================================================================================

var p5Collection = precipitation.filterDate(startDate, endDate).map(function(image) {
  var date = image.date();
  var p5 = precipitation.filterDate(date.advance(-5, 'day'), date.advance(-1, 'day'))
                       .select('p')
                       .sum()
                       .rename('p5')
                       .unmask(0);
  return image.addBands(p5).copyProperties(image, ['system:time_start']);
});

var calculateRunoff = function(image) {
  var p = image.select('p');
  var p5 = image.select('p5');

  var amc = p5.expression(
    "(p5 < 20) ? 1 : (p5 > 40) ? 3 : 2",
    {p5: p5}
  ).rename('amc');

  var s_dynamic = ee.Image(0).clip(aoi)
    .where(amc.eq(1), s1)
    .where(amc.eq(2), s2)
    .where(amc.eq(3), s3)
    .rename('s_dynamic');

  var ia = s_dynamic.multiply(0.2).rename('ia');

  var q = p.expression(
    "(P > Ia) ? ((P - Ia) * (P - Ia)) / (P - Ia + S) : 0",
    {P: p, Ia: ia, S: s_dynamic}
  ).max(0).rename('runoff_mm');

  return q.addBands(p).addBands(s_dynamic).copyProperties(image, ['system:time_start']);
};

var runoffCollection = p5Collection.map(calculateRunoff);

var totalRunoff = runoffCollection.select('runoff_mm').sum().clip(aoi);
var runoffVis = {min: 0, max: 2000, palette: ['white', 'blue', 'darkblue', 'purple']};
Map.addLayer(totalRunoff, runoffVis, 'Total Runoff (mm)');
