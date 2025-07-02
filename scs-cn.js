// Part 1: ตั้งค่าพื้นฐานและข้อมูลนำเข้า
// 1.1 กำหนดขอบเขตพื้นที่ศึกษา (Area of Interest - AOI)
// ตัวอย่าง: สี่เหลี่ยมครอบคลุมจังหวัดเชียงใหม่ แนะนำให้เปลี่ยนเป็นขอบเขตลุ่มน้ำจริง (เช่น จาก shapefile)
var aoi = ee.Geometry.Rectangle([98.5, 18.0, 99.5, 19.5]);
Map.centerObject(aoi, 9);

// 1.2 กำหนดช่วงเวลาที่ศึกษา
var startDate = '2022-01-01';
var endDate = '2022-12-31';

// 1.3 โหลดข้อมูลการใช้ที่ดิน/ที่ดินปกคลุม (Land Use/Land Cover - LULC)
// ใช้ข้อมูล ESA WorldCover ปี 2021 ที่ความละเอียด 10 เมตร
var lulc = ee.Image('ESA/WorldCover/v200/2021').select('Map').clip(aoi);
// คำอธิบายคลาส: 10=ป่าหนาแน่น, 20=พุ่มไม้, 30=หญ้า, 40=เกษตร, 50=เมือง, 60=ดินโล่ง, 70=หิมะ/น้ำแข็ง, 80=น้ำ, 90=พื้นที่ชุ่มน้ำ, 95=ป่าชายเลน

// 1.4 โหลดข้อมูลดิน
// ใช้ข้อมูลชั้นเนื้อดินของ OpenLandMap (แบบ USDA)
var soilTexture = ee.Image('OpenLandMap/SOL/SOL_TEXTURE-CLASS_USDA-TT_M/v02')
    .select('b0')
    .clip(aoi)
    .rename('soil_texture');

// 1.5 โหลดข้อมูลฝนตก
// ใช้ข้อมูลรายวันจาก CHIRPS (~5.5 กม.) และตั้งชื่อใหม่เป็น 'p'
var precipitation = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
    .filterDate(ee.Date(startDate).advance(-5, 'day'), endDate) // เพิ่มข้อมูลล่วงหน้า 5 วัน
    .select('precipitation')
    .map(function (image) {
        return image.rename('p').copyProperties(image, ['system:time_start']);
    });

// แสดงผลข้อมูลการใช้ที่ดินและดินบนแผนที่
var lulcVisParams = {
    min: 10, max: 95,
    palette: ['006400', 'ffbb22', 'ffff4c', 'f096ff', 'fa0000', 'b4b4b4', 'f0f0f0', '0064c8', '0096a0', '00cf75']
};
Map.addLayer(lulc, lulcVisParams, 'ESA WorldCover LULC');
Map.addLayer(soilTexture, { min: 1, max: 12, palette: ['d5c36b', 'b96947', '9d3722', '74281a'] }, 'Soil Texture');

var precipitationVis = {
    min: 500,
    max: 1800,
    palette: ['001137', '0aab1e', 'e7eb05', 'ff4a2d', 'e90000'],
};
Map.addLayer(precipitation.sum().clip(aoi), precipitationVis, 'Precipitation');

// Part 2: พารามิเตอร์ทางอุทกวิทยา
// 2.1 สร้างแผนที่กลุ่มดิน HSG (Hydrologic Soil Group)
// อิงตามชนิดเนื้อดิน ควรใช้ข้อมูลจากกรมพัฒนาที่ดิน (LDD) สำหรับประเทศไทย
var hsg = soilTexture.remap(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // คลาสเนื้อดิน
    [4, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1],    // กลุ่มดิน HSG: 1=A, 2=B, 3=C, 4=D
    4 // ค่าเริ่มต้นหากไม่พบข้อมูล
).rename('hsg');

// 2.2 ตาราง lookup ของค่า Curve Number (CN) สำหรับ AMC II
// กำหนดค่าตามประเภทที่ดินและกลุ่มดิน
var cnLookup = {
    10: [55, 70, 80, 85], // ป่าไม้
    20: [48, 66, 77, 83], // พุ่มไม้
    30: [61, 74, 82, 86], // ทุ่งหญ้า
    40: [67, 78, 85, 89], // เกษตรกรรม
    50: [75, 85, 90, 92], // เมือง/สิ่งปลูกสร้าง
    60: [86, 91, 94, 96], // ดินโล่ง
    70: [98, 98, 98, 98], // หิมะ/น้ำแข็ง
    80: [100, 100, 100, 100], // น้ำ
    90: [100, 100, 100, 100], // พื้นที่ชุ่มน้ำ
    95: [55, 70, 80, 85]  // ป่าชายเลน
};

// 2.3 สร้างแผนที่ค่า CN-II จาก lookup table
var cn2 = ee.Image(0).clip(aoi);
var lulcClasses = Object.keys(cnLookup).map(Number);
lulcClasses.forEach(function (lc) {
    var cnValues = cnLookup[lc];
    var cnImage = hsg.expression(
        "(hsg == 1) ? ca : (hsg == 2) ? cb : (hsg == 3) ? cc : cd",
        { hsg: hsg, ca: cnValues[0], cb: cnValues[1], cc: cnValues[2], cd: cnValues[3] }
    );
    cn2 = cn2.where(lulc.eq(lc), cnImage);
});
cn2 = cn2.rename('cn2').set('description', 'Curve Number for AMC II');

// 2.4 คำนวณค่า CN สำหรับ AMC I และ AMC III
var cn1 = cn2.expression('(4.2 * CN2) / (10 - 0.058 * CN2)', { 'CN2': cn2 }).rename('cn1');
var cn3 = cn2.expression('(23 * CN2) / (10 + 0.13 * CN2)', { 'CN2': cn2 }).rename('cn3');

// 2.5 คำนวณค่า S (Maximum Retention) หน่วย mm
var s1 = cn1.expression('(25400 / CN1) - 254', { 'CN1': cn1 }).rename('s1');
var s2 = cn2.expression('(25400 / CN2) - 254', { 'CN2': cn2 }).rename('s2');
var s3 = cn3.expression('(25400 / CN3) - 254', { 'CN3': cn3 }).rename('s3');

// แสดงแผนที่ค่า CN-II
var cnVis = { min: 30, max: 100, palette: ['green', 'yellow', 'red', 'purple'] };
Map.addLayer(cn2, cnVis, 'Curve Number (CN-II)');

// Part 3: การคำนวณน้ำท่า (Runoff)
// 3.1 คำนวณปริมาณฝนสะสมย้อนหลัง 5 วัน (P5)
var p5Collection = precipitation.filterDate(startDate, endDate).map(function (image) {
    var date = image.date();
    var p5 = precipitation.filterDate(date.advance(-5, 'day'), date.advance(-1, 'day'))
        .select('p')
        .sum()
        .rename('p5')
        .unmask(0);
    return image.addBands(p5).copyProperties(image, ['system:time_start']);
});

// 3.2 คำนวณน้ำท่าแต่ละวัน
var calculateRunoff = function (image) {
    var p = image.select('p');
    var p5 = image.select('p5');

    // กำหนดเงื่อนไข AMC ตามประเทศไทย
    var amc = p5.expression(
        "(p5 < 20) ? 1 : (p5 > 40) ? 3 : 2", // AMC I: <20 mm, AMC III: >40 mm
        { p5: p5 }
    ).rename('amc');

    // เลือกค่า S ตาม AMC
    var s_dynamic = ee.Image(0).clip(aoi)
        .where(amc.eq(1), s1)
        .where(amc.eq(2), s2)
        .where(amc.eq(3), s3)
        .rename('s_dynamic');

    // คำนวณ Ia (Initial Abstraction) = 0.2S
    var ia = s_dynamic.multiply(0.2).rename('ia');

    // สูตรคำนวณน้ำท่า Q (mm)
    var q = p.expression(
        "(P > Ia) ? ((P - Ia) * (P - Ia)) / (P - Ia + S) : 0",
        { P: p, Ia: ia, S: s_dynamic }
    ).max(0).rename('runoff_mm');

    return q.addBands(p).addBands(s_dynamic).copyProperties(image, ['system:time_start']);
};

var runoffCollection = p5Collection.map(calculateRunoff);

// รวมปริมาณน้ำท่าตลอดช่วงเวลา
var totalRunoff = runoffCollection.select('runoff_mm').sum().clip(aoi);
var runoffVis = { min: 0, max: 2000, palette: ['white', 'blue', 'darkblue', 'purple'] };
Map.addLayer(totalRunoff, runoffVis, 'Total Runoff (mm)');

// Part 4: การแสดงผลและวิเคราะห
// 4.1 แผนภูมิแสดงค่าเฉลี่ยของฝนและน้ำท่ารายวันในพื้นที่ศึกษา
var chart = ui.Chart.image.series({
    imageCollection: runoffCollection.select(['p', 'runoff_mm']),
    region: aoi,
    reducer: ee.Reducer.mean(),
    scale: 5566,
    xProperty: 'system:time_start'
}).setOptions({
    title: 'Rainfall vs. Runoff Time Series (Mean over AOI)',
    vAxis: { title: 'Amount (mm)' },
    hAxis: { title: 'Date', format: 'MMM-yyyy' },
    series: { 0: { color: 'blue', label: 'Rainfall' }, 1: { color: 'red', label: 'Runoff' } }
});
print(chart);

// 4.2 การสร้างภาพเคลื่อนไหว (ไม่บังคับ)
var animationParams = {
    crs: 'EPSG:3857',
    framesPerSecond: 5,
    region: aoi,
    min: 0,
    max: 100,
    palette: ['white', 'lightblue', 'blue', 'darkblue'],
    dimensions: 512
};
// print(runoffCollection.select('runoff_mm').getVideoThumbURL(animationParams));
