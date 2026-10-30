import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import FrequentlyBoughtTogether from "./FrequentlyBoughtTogether";
import { getRecommendations } from "../../services/Api";

jest.mock("../../services/Api", () => ({ getRecommendations: jest.fn() }));

const ruleItem = (id, name) => ({
    product: { _id: id, name, image: `demo/${id}.svg`, price: 290000, category_id: "c1" },
    source: "association-rule",
    rule: { antecedent: ["p0"], consequent: [id], support: 0.061, supportCount: 61, confidence: 0.74, lift: 6.58 },
    explanation: "74% đơn có X cũng có Y",
});
const fallbackItem = (id, name) => ({
    product: { _id: id, name, image: `demo/${id}.svg`, price: 24990000, category_id: "c2" },
    source: "fallback",
    fallbackReason: "same-category",
    rule: null,
    explanation: "Không đủ luật kết hợp: sản phẩm cùng danh mục",
});
const response = (algorithm, items) => ({
    data: {
        status: "success",
        data: {
            algorithm,
            params: { minSupport: 0.01, minConfidence: 0.2, limit: 5 },
            items,
            meta: {
                miningMs: algorithm === "apriori" ? 15.44 : 3.21,
                cache: "miss",
                minedAt: "2026-10-26T03:00:00.000Z",
                transactionCount: 1000,
                minSupportCount: 10,
                frequentItemsetCount: 120,
                ruleCount: 174,
                matchedRuleCount: 6,
                ruleItemCount: items.filter((i) => i.source === "association-rule").length,
                fallbackCount: items.filter((i) => i.source === "fallback").length,
            },
        },
    },
});

const renderAt = (url) =>
    render(
        <MemoryRouter initialEntries={[url]}>
            <FrequentlyBoughtTogether productId="p0" />
        </MemoryRouter>
    );

// Mọi chữ kỹ thuật/nghiên cứu không được xuất hiện trên giao diện khách.
const TECHNICAL = /Apriori|FP-Growth|confidence|conf |lift|support|sup |khai phá|ms\b|nghiên cứu|thuật toán|luật|cache|Fallback|minh họa|tham khảo/i;

beforeEach(() => getRecommendations.mockReset());

test("Khách: hai khu vực 'Thường được mua cùng' và 'Có thể bạn cũng quan tâm', thẻ có ảnh/tên/giá/nút", async () => {
    getRecommendations.mockResolvedValue(response("fpgrowth", [ruleItem("a1", "Ốp lưng iPhone 15"), fallbackItem("f1", "iPhone 14 Pro Max")]));
    const { container } = renderAt("/ProductDetails-p0");

    expect(await screen.findByText("Thường được mua cùng")).toBeInTheDocument();
    expect(screen.getByText("Có thể bạn cũng quan tâm")).toBeInTheDocument();

    const ruleSection = screen.getByText("Thường được mua cùng").closest(".fbt-section");
    const fallbackSection = screen.getByText("Có thể bạn cũng quan tâm").closest(".fbt-section");
    expect(ruleSection).toHaveTextContent("Ốp lưng iPhone 15");
    expect(ruleSection).not.toHaveTextContent("iPhone 14 Pro Max");
    expect(fallbackSection).toHaveTextContent("iPhone 14 Pro Max");

    expect(screen.getByAltText("Ốp lưng iPhone 15")).toHaveAttribute("src", expect.stringContaining("images/products/demo/a1.svg"));
    expect(screen.getByText("290.000đ")).toBeInTheDocument();
    expect(container.querySelectorAll(".product-item.card")).toHaveLength(2); // dùng kiểu thẻ sẵn có
    const detail = screen.getAllByText("Xem chi tiết")[0].closest("a");
    expect(detail).toHaveAttribute("href", "/ProductDetails-a1");

    expect(container.textContent).not.toMatch(TECHNICAL);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelector('a[href*="research"]')).toBeNull();
    expect(getRecommendations).toHaveBeenCalledWith("p0", { params: { algorithm: "fpgrowth" } });
});

test("Khách: chỉ có fallback thì không hiện khu vực 'Thường được mua cùng'", async () => {
    getRecommendations.mockResolvedValue(response("fpgrowth", [fallbackItem("f1", "iPhone 14 Pro Max")]));
    const { container } = renderAt("/ProductDetails-p0");
    expect(await screen.findByText("Có thể bạn cũng quan tâm")).toBeInTheDocument();
    expect(screen.queryByText("Thường được mua cùng")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(TECHNICAL);
});

test("Khách: lỗi API hoặc không có gợi ý thì ẩn hẳn khu vực, không hiện thông báo kỹ thuật", async () => {
    // Chờ đúng Promise của API kết thúc (kể cả khi bị từ chối) rồi mới kiểm tra giao diện.
    const settle = (n) => act(() => getRecommendations.mock.results[n].value.then(() => {}, () => {}));

    getRecommendations.mockRejectedValue({ response: { data: { message: "Không đọc được dữ liệu sản phẩm/đơn hàng." } } });
    const { container } = renderAt("/ProductDetails-p0");
    await settle(0);
    expect(container).toBeEmptyDOMElement();

    getRecommendations.mockResolvedValue(response("fpgrowth", []));
    const second = renderAt("/ProductDetails-p0");
    await settle(1);
    expect(second.container).toBeEmptyDOMElement();
});

test("?research=1: đổi Apriori/FP-Growth không tải lại trang, có chỉ số luật và giữ ?research=1 khi chuyển sản phẩm", async () => {
    getRecommendations.mockImplementation((id, { params }) =>
        Promise.resolve(response(params.algorithm, [ruleItem("a1", "Ốp lưng iPhone 15"), fallbackItem("f1", "iPhone 14 Pro Max")]))
    );
    const { container } = renderAt("/ProductDetails-p0?research=1");

    expect(await screen.findByText(/3.21 ms/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "FP-Growth" })).toHaveAttribute("aria-pressed", "true");
    expect(container.textContent).toMatch(/conf 74\.0% · lift 6\.58/);
    expect(container.textContent).toMatch(/sup 6\.1% \(61 đơn\)/);
    expect(screen.getByText("Fallback: cùng danh mục")).toBeInTheDocument();
    expect(screen.getAllByText("Xem chi tiết")[0].closest("a")).toHaveAttribute("href", "/ProductDetails-a1?research=1");

    fireEvent.click(screen.getByRole("button", { name: "Apriori" }));
    expect(await screen.findByText(/15.44 ms/)).toBeInTheDocument();
    expect(getRecommendations).toHaveBeenLastCalledWith("p0", { params: { algorithm: "apriori" } });
    expect(screen.getByRole("button", { name: "Apriori" })).toHaveAttribute("aria-pressed", "true");

    // Các câu dành cho báo cáo đã được bỏ.
    expect(container.textContent).not.toMatch(/chỉ để tham khảo|cùng tập luật/);
});

test("?research=1: lỗi API được hiện để kiểm thử", async () => {
    getRecommendations.mockRejectedValue({ response: { data: { message: "Không đọc được dữ liệu sản phẩm/đơn hàng." } } });
    renderAt("/ProductDetails-p0?research=1");
    expect(await screen.findByText("Không đọc được dữ liệu sản phẩm/đơn hàng.")).toBeInTheDocument();
});
