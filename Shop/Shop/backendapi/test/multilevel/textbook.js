// Dữ liệu kiểm thử dựng theo mục 7.2.1 của giáo trình (Han, Kamber, Pei — 3rd Ed.).

// Hình 7.2: hệ phân cấp khái niệm cho mặt hàng máy tính của AllElectronics (cấp 0 = all ... cấp 4 = item thô).
// Hình chỉ vẽ một số nhãn hiệu (IBM, Dell, Microsoft, HP, Canon, Fellowes, LogiTech); các nhãn hiệu cần cho
// Bảng 7.1 nhưng không có trong hình (Apple, Lenovo, Symantec) được thêm ở cấp 3.
const FIGURE_7_2 = [
    { id: "computer", parent: null },
    { id: "software", parent: null },
    { id: "printer and camera", parent: null },
    { id: "computer accessory", parent: null },
    { id: "laptop computer", parent: "computer" },
    { id: "desktop computer", parent: "computer" },
    { id: "office software", parent: "software" },
    { id: "antivirus software", parent: "software" },
    { id: "printer", parent: "printer and camera" },
    { id: "digital camera", parent: "printer and camera" },
    { id: "wrist pad", parent: "computer accessory" },
    { id: "mouse", parent: "computer accessory" },
    { id: "IBM laptop computer", parent: "laptop computer" },
    { id: "Dell laptop computer", parent: "laptop computer" },
    { id: "Apple laptop computer", parent: "laptop computer" },
    { id: "Lenovo laptop computer", parent: "laptop computer" },
    { id: "Dell desktop computer", parent: "desktop computer" },
    { id: "Microsoft office software", parent: "office software" },
    { id: "Symantec antivirus software", parent: "antivirus software" },
    { id: "HP printer", parent: "printer" },
    { id: "Canon digital camera", parent: "digital camera" },
    { id: "Fellowes wrist pad", parent: "wrist pad" },
    { id: "LogiTech mouse", parent: "mouse" },
    { id: "Microsoft mouse", parent: "mouse" },
    // cấp 4 — item thô của Bảng 7.1
    { id: "Apple 17\" MacBook Pro Notebook", parent: "Apple laptop computer" },
    { id: "HP Photosmart Pro b9180", parent: "HP printer" },
    { id: "Microsoft Office Professional 2010", parent: "Microsoft office software" },
    { id: "Microsoft Wireless Optical Mouse 5000", parent: "Microsoft mouse" },
    { id: "Logitech VX Nano Cordless Laser Mouse", parent: "LogiTech mouse" },
    { id: "Fellowes GEL Wrist Rest", parent: "Fellowes wrist pad" },
    { id: "Dell Studio XPS 16 Notebook", parent: "Dell laptop computer" },
    { id: "Canon PowerShot SD1400", parent: "Canon digital camera" },
    { id: "Lenovo ThinkPad X200 Tablet PC", parent: "Lenovo laptop computer" },
    { id: "Symantec Norton Antivirus 2010", parent: "Symantec antivirus software" },
];

// Bảng 7.1: dữ liệu giao dịch liên quan đến nhiệm vụ.
const TABLE_7_1 = [
    ["Apple 17\" MacBook Pro Notebook", "HP Photosmart Pro b9180"], // T100
    ["Microsoft Office Professional 2010", "Microsoft Wireless Optical Mouse 5000"], // T200
    ["Logitech VX Nano Cordless Laser Mouse", "Fellowes GEL Wrist Rest"], // T300
    ["Dell Studio XPS 16 Notebook", "Canon PowerShot SD1400"], // T400
    ["Lenovo ThinkPad X200 Tablet PC", "Symantec Norton Antivirus 2010"], // T500
];

/** Lặp `count` lần một giao dịch. */
const repeat = (count, items) => Array.from({ length: count }, () => [...items]);

// Hình 7.3 / 7.4: computer [support 10%], laptop computer [6%], desktop computer [4%] (100 giao dịch).
const FIGURE_7_3_HIERARCHY = [
    { id: "computer", parent: null },
    { id: "laptop computer", parent: "computer" },
    { id: "desktop computer", parent: "computer" },
    { id: "printer and camera", parent: null },
    { id: "printer", parent: "printer and camera" },
];
const FIGURE_7_3_TRANSACTIONS = [...repeat(6, ["laptop computer"]), ...repeat(4, ["desktop computer"]), ...repeat(90, ["printer"])];

// Ví dụ 7.2: laptop computer ⇒ HP printer [support 8,4%, confidence 70%]; "Dell laptop computer" chiếm 1/4
// số đơn laptop -> kỳ vọng Dell laptop computer ⇒ HP printer có support 2,1% và confidence 70%.
const EXAMPLE_7_2_HIERARCHY = [
    { id: "laptop computer", parent: null },
    { id: "Dell laptop computer", parent: "laptop computer" },
    { id: "IBM laptop computer", parent: "laptop computer" },
    { id: "printer", parent: null },
    { id: "HP printer", parent: "printer" },
    { id: "Canon printer", parent: "printer" },
    { id: "mouse", parent: null },
];
/** dellWithHp = số đơn có Dell laptop + HP printer (21 -> đúng kỳ vọng, 28 -> confidence 93%, không dư thừa). */
function example72Transactions(dellWithHp = 21) {
    return [
        ...repeat(dellWithHp, ["Dell laptop computer", "HP printer"]),
        ...repeat(30 - dellWithHp, ["Dell laptop computer"]),
        ...repeat(84 - dellWithHp, ["IBM laptop computer", "HP printer"]),
        ...repeat(90 - (84 - dellWithHp), ["IBM laptop computer"]),
        ...repeat(60, ["HP printer"]),
        ...repeat(50, ["Canon printer"]),
        ...repeat(1000 - 30 - 90 - 60 - 50, ["mouse"]),
    ];
}

module.exports = { FIGURE_7_2, TABLE_7_1, FIGURE_7_3_HIERARCHY, FIGURE_7_3_TRANSACTIONS, EXAMPLE_7_2_HIERARCHY, example72Transactions, repeat };
