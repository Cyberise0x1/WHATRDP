import type { Metadata } from "next";
import { OrderConsole } from "@/components/OrderConsole";

export const metadata: Metadata = {
  title: "Order — WHATRDP",
  description: "Private order status and connection details.",
};

export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <OrderConsole token={token} />;
}
