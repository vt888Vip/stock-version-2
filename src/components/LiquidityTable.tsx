"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Row {
  pair: string;
  type: string;
  quantity: number;
}

const PAIRS = [
  "Vàng/Đô la Mỹ",
  "OIL/USD",
  "EUR/USD",
];

// Generates a random VND quantity ~ 400–700 million rounded to 500,000
const randomQty = () => {
  const min = 10_000_000;
  const max = 54_000_000;
  const qty = Math.floor(Math.random() * (max - min) + min);
  return Math.floor(qty / 500_000) * 500_000;
};

export default function LiquidityTable() {
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: 10 }, () => ({
      pair: PAIRS[Math.floor(Math.random() * PAIRS.length)],
      type: "Market",
      quantity: randomQty(),
    }))
  );

  // update every 2 seconds
  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) => {
        // generate new random rows
        const newRows = prev.map((r) => ({
          ...r,
          quantity: randomQty(),
        }));
        // shuffle rows for dynamic feel
        for (let i = newRows.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newRows[i], newRows[j]] = [newRows[j], newRows[i]];
        }
        return newRows;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const formatCurrency = (value: number) =>
    value.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-300 text-xs sm:text-sm text-left text-gray-900">
        <thead className="bg-gray-100 uppercase text-gray-600">
          <tr>
            <th scope="col" className="px-2 sm:px-4 py-1.5 sm:py-2 font-medium text-xs sm:text-sm">
              Cặp giao dịch
            </th>
            <th scope="col" className="px-2 sm:px-4 py-1.5 sm:py-2 font-medium text-xs sm:text-sm">
              Loại
            </th>
            <th scope="col" className="px-2 sm:px-4 py-1.5 sm:py-2 font-medium text-xs sm:text-sm">
              Số lượng
            </th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence>
            {rows.map((row, idx) => (
              <motion.tr
                key={idx}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.3 }}
                className="border-b border-gray-200"
              >
                <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm">
                  {row.pair}
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm">
                  {row.type}
                </td>
                <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-xs sm:text-sm">
                  {formatCurrency(row.quantity)}
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
