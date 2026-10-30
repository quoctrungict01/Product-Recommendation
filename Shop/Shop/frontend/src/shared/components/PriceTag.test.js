import React from "react";
import { render, screen } from "@testing-library/react";
import PriceTag from "./PriceTag";
import { getPricing, toMoney } from "../ultils/pricing";

const priced = (extra) => ({ price: "19990000", original_price: 19990000, final_price: 19990000, discount_amount: 0, discount_percent: 0, has_discount: false, promotion_text: null, ...extra });

test("có ưu đãi hợp lệ: giá bán nổi bật, giá gốc gạch ngang, phần trăm giảm", () => {
    const { container } = render(<PriceTag product={priced({ final_price: 19490000, discount_amount: 500000, discount_percent: 3, has_discount: true })} />);
    expect(container.querySelector(".price-tag-final")).toHaveTextContent("19.490.000đ");
    expect(container.querySelector("del")).toHaveTextContent("19.990.000đ");
    expect(screen.getByText("-3%")).toBeInTheDocument();
});

test("không giảm giá: chỉ một giá, không gạch ngang, không phần trăm", () => {
    const { container } = render(<PriceTag product={priced()} />);
    expect(container.querySelector(".price-tag-final")).toHaveTextContent("19.990.000đ");
    expect(container.querySelector("del")).toBeNull();
    expect(container.textContent).not.toMatch(/%/);
});

test("dữ liệu sai không bao giờ hiện giá âm, NaN hay giảm >= 100%", () => {
    const cases = [
        priced({ final_price: 100, has_discount: true, discount_percent: 150, original_price: 1000 }),
        priced({ final_price: 2000, has_discount: true, discount_percent: 10, original_price: 1000 }),
        priced({ final_price: -5 }),
        priced({ final_price: NaN }),
        priced({ final_price: null }),
    ];
    for (const product of cases) {
        const { container, unmount } = render(<PriceTag product={product} />);
        expect(container.textContent).not.toMatch(/NaN|-\d+đ|\d{3,}%/);
        expect(container.querySelector("del")).toBeNull();
        unmount();
    }
    expect(getPricing(priced({ final_price: null })).price).toBeNull();
    render(<PriceTag product={priced({ final_price: null, original_price: null })} />);
    expect(screen.getByText("Liên hệ để biết giá")).toBeInTheDocument();
});

test("sản phẩm cũ trong giỏ (chưa có trường giá backend): hiện price, không tự tính ưu đãi", () => {
    expect(getPricing({ price: "290000", promotion: "50000" })).toEqual({ price: 290000, original: null, percent: 0, hasDiscount: false, promotionText: null });
    expect(getPricing({ price: 19490000 }).price).toBe(19490000);
    expect(toMoney("19.990.000")).toBe(19990000);
    expect(toMoney("abc")).toBeNull();
});
