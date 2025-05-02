// State management for cross-component communication
const appState = {
    timeRange: null,
    selectedProduct: null,
    selectedRows: [],
    updateTimeRange(range) {
        this.timeRange = range;
        this.notifyVisualizations();
    },
    updateSelectedProduct(product) {
        this.selectedProduct = product;
        this.notifyVisualizations();
    },
    updateSelectedRows(rows) {
        this.selectedRows = rows;
        this.notifyVisualizations();
    },
    notifyVisualizations() {
        updateAreaChart(this);
        updateBarChart(this);
        updateDataTable(this);
    },
};

let rawData = [];

// Load data and initialize visualizations
d3.csv("Chocolate Sales.csv").then((data) => {
    rawData = data;
    data.forEach((d) => {
        d.Date = d3.timeParse("%d-%b-%y")(d.Date);
        d.Amount = +d.Amount.replace(/[$,]/g, "");
        d["Boxes Shipped"] = +d["Boxes Shipped"];
    });

    createDataTable(data);
    createAreaChart(data);
    createBarChart(data);

    d3.select("#reset-button").on("click", () => {
        appState.updateTimeRange(null);
        appState.updateSelectedProduct(null);
        appState.updateSelectedRows([]);
    });
});

function createDataTable(data) {
    const table = d3.select("#data-table").append("table").attr("class", "datatable");
    const thead = table.append("thead");
    const tbody = table.append("tbody");

    const columns = ["Sales Person", "Country", "Product", "Date", "Amount", "Boxes Shipped"];

    const headerCells = thead.append("tr")
        .selectAll("th")
        .data(columns)
        .enter()
        .append("th")
        .html(d => `${d} <span class="sort-arrow"></span>`)
        .on("click", (event, column) => {
            const ascending = !d3.select(event.target).classed("ascending");
            d3.selectAll("th").classed("ascending", false).classed("descending", false).select(".sort-arrow").text("");
            d3.select(event.target).classed(ascending ? "ascending" : "descending", true)
                .select(".sort-arrow")
                .text(ascending ? "▲" : "▼");

            const sortedData = data.sort((a, b) =>
                ascending ? d3.ascending(a[column], b[column]) : d3.descending(a[column], b[column])
            );
            updateDataTableRows(sortedData.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage));
        });

    const filterRow = thead.append("tr")
        .selectAll("th")
        .data(columns)
        .enter()
        .append("th")
        .each(function (column) {
            if (["Date", "Amount", "Boxes Shipped"].includes(column)) {
                d3.select(this).append("input")
                    .attr("type", "text")
                    .attr("placeholder", `Search ${column}`)
                    .style("width", "100%")
                    .on("input", function () {
                        const value = d3.select(this).property("value").toLowerCase();
                        const filtered = data.filter(d => d[column].toString().toLowerCase().includes(value));
                        updateDataTableRows(filtered.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage));
                        updatePaginationControls(filtered);
                    });
            } else {
                const unique = Array.from(new Set(data.map(d => d[column])));
                unique.unshift("All");
                d3.select(this).append("select")
                    .attr("class", "filter-dropdown")
                    .style("width", "100%")
                    .on("change", function () {
                        const selected = d3.select(this).property("value");
                        const filtered = selected === "All" ? data : data.filter(d => d[column] === selected);
                        updateDataTableRows(filtered.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage));
                        updatePaginationControls(filtered);
                    })
                    .selectAll("option")
                    .data(unique)
                    .enter()
                    .append("option")
                    .text(d => d);
            }
        });

    const rowsPerPage = 10;
    let currentPage = 0;
    let columnWidths = [];

    function updateDataTableRows(filteredData) {
        const rows = tbody.selectAll("tr").data(filteredData, d => d.Product);
        rows.exit().remove();

        if (columnWidths.length === 0) {
            columnWidths = headerCells.nodes().map(header => header.getBoundingClientRect().width);
        }

        const newRows = rows.enter()
            .append("tr")
            .on("click", (event, d) => {
                appState.updateSelectedRows([d]);
            });

        newRows.merge(rows)
            .classed("selected", d => appState.selectedRows.includes(d))
            .selectAll("td")
            .data(row => columns.map(col =>
                col === "Date" ? d3.timeFormat("%Y. %m. %d")(row[col]) : row[col]
            ))
            .join("td")
            .style("width", (d, i) => `${columnWidths[i]}px`)
            .text(d => d);
    }

    function updatePaginationControls(filteredData = data) {
        const totalPages = Math.ceil(filteredData.length / rowsPerPage);
        d3.select("#pagination-controls").remove();

        const container = d3.select("#data-table").append("div")
            .attr("id", "pagination-controls")
            .style("margin-top", "10px");

        container.append("div")
            .attr("class", "pagination-info")
            .text(() => {
                const start = currentPage * rowsPerPage + 1;
                const end = Math.min((currentPage + 1) * rowsPerPage, filteredData.length);
                return `Showing ${start} to ${end} of ${filteredData.length} entries`;
            });

        const wrapper = container.append("div")
            .attr("class", "pagination-wrapper")
            .style("display", "flex")
            .style("justify-content", "center");

        const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

        wrapper.selectAll("button.page-btn")
            .data(pages)
            .enter()
            .append("button")
            .attr("class", "page-btn")
            .text(d => d)
            .style("margin", "0 5px")
            .on("click", (event, page) => {
                currentPage = page - 1;
                updateDataTableRows(filteredData.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage));
                updatePaginationControls(filteredData);
            });
    }

    updateDataTableRows(data.slice(0, rowsPerPage));
    updatePaginationControls();
}

function createAreaChart(data) {
    const margin = { top: 20, right: 15, bottom: 60, left: 45 };
    const ctxMargin = { top: 20, right: 15, bottom: 20, left: 45 };
    const parentElement = d3.select("#area-chart");
    const parentWidth = parentElement.node().clientWidth;
    const parentHeight = 400;
    const width = parentWidth - margin.left - margin.right;
    const height = parentHeight * 0.7 - margin.top - margin.bottom;
    const ctxHeight = parentHeight * 0.3 - ctxMargin.top - ctxMargin.bottom;

    const aggregated = d3.rollups(data, v => d3.sum(v, d => d.Amount), d => d.Date)
        .map(([Date, Total]) => ({ Date, Total }));

    const allDates = d3.timeDay.range(
        d3.min(aggregated, d => d.Date),
        d3.max(aggregated, d => d.Date)
    );

    const dataMap = new Map(aggregated.map(d => [d.Date.getTime(), d.Total]));
    const filled = allDates.map(date => ({
        Date: date,
        Total: dataMap.get(date.getTime()) || 0
    }));

    const x = d3.scaleTime().domain(d3.extent(filled, d => d.Date)).range([0, width]);
    const y = d3.scaleLinear().domain([0, d3.max(filled, d => d.Total)]).nice().range([height, 0]);
    const ctxX = x.copy();
    const ctxY = d3.scaleLinear().domain(y.domain()).range([ctxHeight, 0]);

    const areaGen = d3.area().x(d => x(d.Date)).y0(height).y1(d => y(d.Total));
    const ctxAreaGen = d3.area().x(d => ctxX(d.Date)).y0(ctxHeight).y1(d => ctxY(d.Total));

    const totalHeight = height + ctxHeight + margin.top + ctxMargin.bottom + 30;
    const svg = parentElement.append("svg")
        .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${totalHeight}`);

    const mainGroup = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);

    mainGroup.append("path").datum(filled).attr("fill", "#69b3a2")
        .attr("d", areaGen.y1(height))
        .transition().duration(1000)
        .attr("d", areaGen.y1(d => y(d.Total)));

    mainGroup.append("g").attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x).tickSizeOuter(0));

    mainGroup.append("g").attr("class", "y-axis")
        .call(d3.axisLeft(y).ticks(6, "s"));

    const ctxGroup = svg.append("g").attr("transform", `translate(${ctxMargin.left}, ${margin.top + height + 30})`);

    ctxGroup.append("path").datum(filled).attr("fill", "#a8d5ba").attr("d", ctxAreaGen);

    ctxGroup.append("g").attr("class", "x-axis").attr("transform", `translate(0,${ctxHeight})`)
        .call(d3.axisBottom(ctxX).ticks(width < 500 ? 4 : 8));

    const brush = d3.brushX().extent([[0, 0], [width, ctxHeight]]).on("end", handleBrush);
    ctxGroup.append("g").attr("class", "brush").call(brush);

    function zoom(newXDomain) {
        x.domain(newXDomain);
        mainGroup.select("path").transition().duration(600).attr("d", areaGen);
        mainGroup.select(".x-axis").transition().duration(600).call(d3.axisBottom(x).tickSizeOuter(0));
    }

    function handleBrush({ selection }) {
        if (!selection) return;
        const [x0, x1] = selection.map(ctxX.invert);
        appState.updateTimeRange([x0, x1]);
        zoom([x0, x1]);
    }

    createAreaChart.zoom = zoom;
}

function createBarChart(data) {
    const margin = { top: 40, right: 30, bottom: 70, left: 60 };
    const parentElement = d3.select("#bar-chart");
    const width = parentElement.node().clientWidth - margin.left - margin.right;
    const height = 300;

    const svg = parentElement.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom);

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const categories = Array.from(new Set(data.map(d => d.Product)));
    const categoryData = categories.map(category => ({
        category,
        total: d3.sum(data.filter(d => d.Product === category), d => d.Amount),
    }));

    const x = d3.scaleBand().domain(categories).range([0, width]).padding(0.2);
    const y = d3.scaleLinear().domain([0, d3.max(categoryData, d => d.total)]).range([height, 0]);
    const color = d3.scaleOrdinal().domain(categories).range(d3.schemeTableau10);

    g.selectAll(".bar")
        .data(categoryData)
        .enter()
        .append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.category))
        .attr("width", x.bandwidth())
        .attr("y", d => y(d.total))
        .attr("height", d => height - y(d.total))
        .attr("fill", d => color(d.category))
        .style("opacity", d => appState.selectedProduct && appState.selectedProduct !== d.category ? 0.4 : 1)
        .on("click", (event, d) => {
            appState.updateSelectedProduct(d.category);
        })
        .on("mouseover", function (event, d) {
            d3.select(this).transition().duration(300).attr("fill", d3.color(color(d.category)).darker(1));
        })
        .on("mouseout", function (event, d) {
            d3.select(this).transition().duration(300).attr("fill", color(d.category));
        });

    g.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "rotate(-40)")
        .style("text-anchor", "end")
        .style("font-size", "12px");

    g.append("g").attr("class", "y-axis").call(d3.axisLeft(y).ticks(6)).selectAll("text").style("font-size", "12px");

    svg.append("text")
        .attr("x", margin.left + width / 2)
        .attr("y", margin.top / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .text("Sales Amount by Product");
}

function updateAreaChart(state) {
    const filteredData = rawData.filter(d => !state.selectedProduct || d.Product === state.selectedProduct);
    d3.select("#area-chart svg").remove();
    createAreaChart(filteredData);
    if (state.timeRange) createAreaChart.zoom(state.timeRange);
}

function updateBarChart(state) {
    const filteredData = rawData.filter(d =>
        !state.timeRange || (d.Date >= state.timeRange[0] && d.Date <= state.timeRange[1])
    );
    d3.select("#bar-chart svg").remove();
    createBarChart(filteredData);
}

function updateDataTable(state) {
    const filteredData = rawData.filter(d => {
        const inTimeRange = !state.timeRange || (d.Date >= state.timeRange[0] && d.Date <= state.timeRange[1]);
        const inProductRange = !state.selectedProduct || d.Product === state.selectedProduct;
        return inTimeRange && inProductRange;
    });
    d3.select("#data-table table").remove();
    d3.select("#pagination-controls").remove();
    createDataTable(filteredData);
}
