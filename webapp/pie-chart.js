(function () {

  // statistical query components for CartoDB per metric (ADT, IRI, PIC)

  var queries = [
    [
      'select 1 as seq, \'#C7E9B4\' as color, \'0 - 2,500\' as label, round(sum(to_milepoint - from_milepoint)) as value from ia_pci_2013 where adt < 2500',
      'select 2 as seq, \'#7FCDBB\' as color, \'2,500 - 5,000\' as label, round(sum(to_milepoint - from_milepoint)) as value from ia_pci_2013 where 2500 <= adt and adt < 5000',
      'select 3 as seq, \'#41B6C4\' as color, \'5,000 - 10,000\' as label, round(sum(to_milepoint - from_milepoint)) as value from ia_pci_2013 where 5000 <= adt and adt < 10000',
      'select 4 as seq, \'#1D91C0\' as color, \'10,000 - 20,000\' as label, round(sum(to_milepoint - from_milepoint)) as value from ia_pci_2013 where 10000 <= adt and adt < 20000',
      'select 5 as seq, \'#225EA8\' as color, \'20,000 - 40,000\' as label, round(sum(to_milepoint - from_milepoint)) as value from ia_pci_2013 where 20000 <= adt and adt < 40000',
      'select 6 as seq, \'#0C2C84\' as color, \'40,000 - 90,400\' as label, round(sum(to_milepoint - from_milepoint)) as value from ia_pci_2013 where 40000 <= adt'
    ],
    [
      'select 1 as seq, \'#00e080\' as color, \'0.00 - 1.49\' as label, round(sum(to_milepoint - from_milepoint)) as value from ia_pci_2013 where iri < 1.49',
      'select 2 as seq, \'#f0f040\' as color, \'1.49 - 2.70\' as label, round(sum(to_milepoint - from_milepoint)) as value from ia_pci_2013 where 1.49 <= iri and iri < 2.7',
      'select 3 as seq, \'#b00000\' as color, \'2.70 - 9.70\' as label, round(sum(to_milepoint - from_milepoint)) as value from ia_pci_2013 where 2.7 <= iri'
    ],
    [
      'select 1 as seq, \'#b00000\' as color, \'0 - 40\' as label, round(sum(to_milepoint - from_milepoint)) as value from ia_pci_2013 where pci < 40',
      'select 2 as seq, \'#e0a000\' as color, \'40 - 50\' as label, round(sum(to_milepoint - from_milepoint)) as value from ia_pci_2013 where 40 <= pci and pci < 50',
      'select 3 as seq, \'#f0f040\' as color, \'50 - 80\' as label, round(sum(to_milepoint - from_milepoint)) as value from ia_pci_2013 where 50 <= pci and pci < 80',
      'select 4 as seq, \'#00e080\' as color, \'80 - 100\' as label, round(sum(to_milepoint - from_milepoint)) as value from ia_pci_2013 where 80 <= pci'
    ]
  ];

  var db = new cartodb.SQL({ user: 'clientdemos' });

  var ctx = $('#pie-chart').get(0).getContext('2d');
  var pie, lastMetric;

  var $title = $('#pie-title');

  var pieChart = {
    show: function (metric, district) {

      // provided metric is 1-based

      metric -= 1;

      // generate the query for this metric and district

      var query = queries[metric].map(function (q) {
        return q + (district ? ' and district = ' + district : '');
      }).join(' union ');

      // execute the query

      db.execute(query)
        .done(function (result) {

          // make sure the rows are sorted on sequence number

          result.rows.sort(function (a, b) {
            return a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0;
          });

          // if the metric is different than last time, create a new chart

          if (metric !== lastMetric) {
            if (pie) {
              pie.destroy();
            }

            pie = new Chart(ctx).Pie(result.rows, { animationEasing: "easeInOutQuart" });
          }

          // otherwise update the data on the current chart

          else {
            for (var i = 0; i < result.rows.length; ++i) {
              pie.segments[i].value = result.rows[i].value;
            }

            pie.update();
          }

          // show the district number
          
          $title.text(district === 0 ? 'State of Iowa' : 'District ' + district);
          lastMetric = metric;
        })
        .error(function (err) {
          alert(err);
        });
    }
  };

  window.app = window.app || {};
  window.app.pieChart = pieChart;
})();
