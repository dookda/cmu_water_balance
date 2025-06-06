// 1. Define your region of interest (replace with your own watershed)
// e.g. import a Fusion Table / Asset, or draw a geometry:

// 2. Load CHIRPS-daily, filter dates and bounds
var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
    .filterDate('2018-01-01', '2024-12-31')
    .filterBounds(roi)
    .select('precipitation');

// 3. Compute an annual sum for each year
var years = ee.List.sequence(2018, 2024);
var annualPrecip = ee.ImageCollection(
    years.map(function (y) {
        var yearly = chirps
            .filter(ee.Filter.calendarRange(y, y, 'year'))
            .sum()
            .set('year', y);
        return yearly;
    })
);

// 4. Create a chart of mean annual precipitation over ROI
var chart = ui.Chart.image
    .series({
        imageCollection: annualPrecip,
        region: roi,
        reducer: ee.Reducer.mean(),
        scale: 5000,
        xProperty: 'year'
    })
    .setOptions({
        title: 'Mean Annual Precipitation (CHIRPS) 2018–2024',
        hAxis: { title: 'Year', format: '####', gridlines: { count: years.size() } },
        vAxis: { title: 'Precipitation (mm)' },
        lineWidth: 2,
        pointSize: 6
    });

// 5. Print chart to the console
print(chart);


var visParams = {
    min: 700,
    max: 2300,  // ปรับให้ครอบคลุมค่าสูงสุดของคุณ
    palette: [
        'ffffcc', 'a1dab4', '41b6c4', '2c7fb8', '253494'
    ]
};

// 2. รายชื่อปีที่คำนวณไว้
var listYears = [2018, 2019, 2020, 2021, 2022, 2023, 2024];

// 3. วนลูปเพิ่มแต่ละปีเป็นเลเยอร์บนแผนที่
listYears.forEach(function (y) {
    // ดึงภาพปีนั้น
    var annualImage = annualPrecip
        .filter(ee.Filter.eq('year', y))
        .first()
        .clip(roi);

    // เพิ่มเป็นเลเยอร์
    Map.addLayer(
        annualImage,
        visParams,
        'Annual Precip ' + y,
    /* shown */ false  // ตั้งเป็น false เพื่อไม่ให้โชว์พร้อมกันทั้งหมด ปรับเป็น true หากต้องการโชว์ทันที
    );
});

// 4. จัดตำแหน่งแผนที่ให้ครอบ ROI
Map.centerObject(roi, 8);

// ====== Legend Panel ======
var legend = ui.Panel({
    style: {
        position: 'bottom-left',
        padding: '8px 15px',
        backgroundColor: 'rgba(255, 255, 255, 0.8)'
    }
});

// 1. Title
legend.add(ui.Label({
    value: 'Annual Precipitation (mm)',
    style: {
        fontWeight: 'bold',
        fontSize: '14px',
        margin: '0 0 4px 0'
    }
}));

// 2. Legend items (สี + ค่า)
var palette = visParams.palette;   // ['ffffcc','a1dab4','41b6c4','2c7fb8','253494']
var min = visParams.min;           // 0
var max = visParams.max;           // 3000
var n = palette.length;
var step = (max - min) / (n - 1);

for (var i = 0; i < n; i++) {
    var color = palette[i];
    var label = Math.round(min + step * i);

    // สร้างกล่องสี
    var colorBox = ui.Label({
        style: {
            backgroundColor: '#' + color,
            padding: '8px',
            margin: '0 4px'
        }
    });

    // สร้างคำอธิบายค่าสี
    var description = ui.Label({
        value: label + ' mm',
        style: { margin: '0 0 0 4px' }
    });

    // รวมกล่องสีและคำอธิบายเป็นแถว
    var row = ui.Panel({
        widgets: [colorBox, description],
        layout: ui.Panel.Layout.Flow('horizontal')
    });

    legend.add(row);
}

// 3. เพิ่ม Legend ลงใน Map
Map.add(legend);

