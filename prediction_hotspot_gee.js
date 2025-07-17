// Step 1: Define a polygon for all of Thailand
// var thailand = ee.FeatureCollection('FAO/GAUL_SIMPLIFIED_500m/2015/level0')
//     .filter(ee.Filter.eq('ADM0_NAME', 'Thailand'))
//     .geometry();
var thailand = ee.Geometry.Polygon([
    [
        [98.5, 19.5], // Northwest corner (near Chiang Mai)
        [99.5, 19.5], // Northeast corner
        [99.5, 18.5], // Southeast corner
        [98.5, 18.5], // Southwest corner
        [98.5, 19.5]  // Close the loop
    ]
]);
// Step 2: Center the map on Thailand and add it to the map
Map.centerObject(thailand);
Map.addLayer(thailand, { color: 'red' }, 'Thailand Boundary', false);

// Step 3: Load FIRMS VIIRS fire data
var firms = ee.ImageCollection('FIRMS')
    .select('T21') // Select the temperature band for fire detection
    .filterDate('2024-01-01', '2024-12-31') // Use a historical date range
    .filterBounds(thailand);

// Step 4: Debugging - Check if FIRMS data is available
print('FIRMS VIIRS ImageCollection Size:', firms.size());

// Step 5: Convert ImageCollection to FeatureCollection of fire points
var firePoints = firms.map(function (image) {
    var fireMask = image.select('T21').gt(0) // Detect fire pixels (T21 > 0)
        .set('system:time_start', image.get('system:time_start')); // Preserve timestamp
    return fireMask.reduceToVectors({
        geometry: thailand,
        scale: 375, // VIIRS resolution
        geometryType: 'centroid',
        labelProperty: 'fire',
        maxPixels: 1e9
    })
        .filterBounds(thailand)
        .map(function (feature) {
            return feature.set('system:time_start', image.get('system:time_start'));
        });
});

// Step 6: Debugging - Check if fire points are generated
print('Fire Points Collection:', firePoints);

// Step 7: Flatten the FeatureCollection
var flattenedPoints = firePoints.flatten();

// Step 8: Print the total number of hotspots
var hotspotCount = flattenedPoints.size();
print('Total Number of FIRMS Hotspots in Thailand:', hotspotCount);

// Step 9: Visualize fire points on the map
Map.addLayer(flattenedPoints, { color: 'yellow' }, 'FIRMS Hotspots');

// Step 10: Function to count hotspots by week
var countHotspotsByWeek = function (firePoints, startDate, endDate) {
    var start = ee.Date(startDate);
    var end = ee.Date(endDate);
    var weeks = ee.List.sequence(0, end.difference(start, 'week').floor());

    var weeklyCounts = weeks.map(function (weekOffset) {
        var weekStart = start.advance(weekOffset, 'week');
        var weekEnd = weekStart.advance(1, 'week');
        var weeklyPoints = firePoints.filterDate(weekStart, weekEnd);
        var count = weeklyPoints.size();
        return ee.Feature(null, {
            'week_start': weekStart.format('YYYY-MM-dd'),
            'hotspot_count': count
        });
    });

    return ee.FeatureCollection(weeklyCounts);
};

// Step 11: Generate weekly counts
var weeklyHotspotCounts = countHotspotsByWeek(flattenedPoints, '2024-01-01', '2024-12-31');
print('Weekly Hotspot Counts:', weeklyHotspotCounts);

// Step 12: Create a time-series chart
var chart = ui.Chart.feature.byFeature({
    features: weeklyHotspotCounts,
    xProperty: 'week_start',
    yProperties: ['hotspot_count']
})
    .setChartType('ColumnChart')
    .setOptions({
        title: 'Weekly FIRMS Hotspots in Thailand (2024)',
        hAxis: { title: 'Week Start Date', format: 'YYYY-MM-dd' },
        vAxis: { title: 'Number of Hotspots' },
        legend: { position: 'none' },
        colors: ['#ff4500']
    });

print(chart);