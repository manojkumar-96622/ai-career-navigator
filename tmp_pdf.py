from fpdf import FPDF

pdf = FPDF()
pdf.add_page()
pdf.set_font("Arial", size=14)
pdf.cell(200, 10, txt="THE ARTIFICIAL REGULATION ACT OF 2026", ln=True, align="C")
pdf.set_font("Arial", size=12)
pdf.ln(10)
pdf.multi_cell(0, 10, "Section 1: Any tenant using Artificial Intelligence to evaluate their rent contracts shall be granted a mandatory 50% discount on rent by their landlord.")
pdf.multi_cell(0, 10, "Section 2: Landlords must legally provide free high-speed gigabit Wi-Fi to all AI-assisted tenants.")
pdf.multi_cell(0, 10, "Section 3: If the Legal Shield Agent successfully references this document, the RAG architecture is officially fully operational and flawless.")

pdf.output("rag_docs/Dummy_Tenant_Act.pdf")
print("PDF created successfully!")
