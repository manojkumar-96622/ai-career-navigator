import os
import chromadb
from pypdf import PdfReader

# Initialize an in-memory client for Render compatibility
chroma_client = chromadb.Client()
collection_name = "official_docs"

# Delete any existing collection to avoid ghost duplicates on auto-reload
try:
    chroma_client.delete_collection(name=collection_name)
except Exception:
    pass

collection = chroma_client.create_collection(name=collection_name)

def load_documents(docs_dir="rag_docs/"):
    """Reads all PDFs in the rag_docs folder, chunks them, and stores them in ChromaDB."""
    if not os.path.exists(docs_dir):
        os.makedirs(docs_dir)
        print(f"[RAG] Created {docs_dir} folder.")
        return

    doc_files = [f for f in os.listdir(docs_dir) if f.endswith('.pdf') or f.endswith('.txt')]
    if not doc_files:
        print("[RAG] No PDFs or TXT files found in rag_docs/. Skipping RAG ingestion.")
        return

    print(f"[RAG] Found {len(doc_files)} official documents in {docs_dir}. Ingesting...")
    
    docs = []
    ids = []
    metadatas = []
    
    for filename in doc_files:
        filepath = os.path.join(docs_dir, filename)
        try:
            full_text = ""
            if filename.endswith('.pdf'):
                reader = PdfReader(filepath)
                for page in reader.pages:
                    text = page.extract_text()
                    if text:
                        full_text += text + "\n\n"
            else:
                with open(filepath, 'r', encoding='utf-8') as f:
                    full_text = f.read()
            
            # Simple paragraph chunking
            chunks = [c.strip() for c in full_text.split("\n\n") if len(c.strip()) > 50]
            
            for i, chunk in enumerate(chunks):
                docs.append(chunk)
                ids.append(f"{filename}_chunk_{i}")
                metadatas.append({"source": filename})
                
        except Exception as e:
            print(f"[RAG] Error loading {filename}: {e}")
            
    if docs:
        collection.add(
            documents=docs,
            metadatas=metadatas,
            ids=ids
        )
        print(f"[RAG] Successfully ingested {len(docs)} chunks into memory!")

def search_knowledge(query: str, n_results=3) -> str:
    """Searches the vector database for the top 3 most relevant paragraphs."""
    try:
        # Avoid error if collection is completely empty
        if collection.count() == 0:
            return ""
            
        results = collection.query(
            query_texts=[query],
            n_results=min(n_results, collection.count())
        )
        
        if not results['documents'] or not results['documents'][0]:
            return ""
            
        context = ""
        for i, doc in enumerate(results['documents'][0]):
            source = results['metadatas'][0][i]['source']
            context += f"--- Excerpt from {source} ---\n{doc}\n\n"
            
        return context
    except Exception as e:
        print(f"[RAG] Search error: {e}")
        return ""

# Auto-ingest on load
load_documents()
