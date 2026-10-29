export interface OfxTransaction {
  fitid: string;
  type: 'EXPENSE' | 'INCOME';
  date: string; // YYYY-MM-DD
  amount: number;
  memo: string;
  checkNumber?: string;
}

export function parseOFX(ofxContent: string): OfxTransaction[] {
  const transactions: OfxTransaction[] = [];

  // Localiza cada bloco <STMTTRN>...</STMTTRN>
  // O padrão SGML antigo não fecha </STMTTRN>, então buscamos de <STMTTRN> até o próximo <STMTTRN> ou </BANKTRANLIST>
  const parts = ofxContent.split(/<STMTTRN>/i);

  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];

    // Extrair TRNTYPE
    const typeMatch = block.match(/<TRNTYPE>([^<\r\n]+)/i);
    const trnType = typeMatch ? typeMatch[1].trim().toUpperCase() : '';

    // Extrair DTPOSTED (formato comum: YYYYMMDDHHMMSS...)
    const dateMatch = block.match(/<DTPOSTED>([0-9]{8})/i);
    let dateStr = '';
    if (dateMatch) {
      const raw = dateMatch[1];
      const y = raw.substring(0, 4);
      const m = raw.substring(4, 6);
      const d = raw.substring(6, 8);
      dateStr = `${y}-${m}-${d}`;
    } else {
      const now = new Date();
      dateStr = now.toISOString().split('T')[0];
    }

    // Extrair TRNAMT
    const amtMatch = block.match(/<TRNAMT>([-\d\.,]+)/i);
    let rawAmt = 0;
    if (amtMatch) {
      rawAmt = parseFloat(amtMatch[1].replace(',', '.'));
    }

    // Extrair FITID
    const idMatch = block.match(/<FITID>([^<\r\n]+)/i);
    const fitid = idMatch ? idMatch[1].trim() : String(Date.now() + i);

    // Extrair MEMO ou NAME
    const memoMatch = block.match(/<MEMO>([^<\r\n]+)/i);
    const nameMatch = block.match(/<NAME>([^<\r\n]+)/i);
    const memo = (memoMatch ? memoMatch[1] : nameMatch ? nameMatch[1] : 'Lançamento bancário').trim();

    // Extrair CHECKNUM
    const checkMatch = block.match(/<CHECKNUM>([^<\r\n]+)/i);
    const checkNumber = checkMatch ? checkMatch[1].trim() : undefined;

    // Determina tipo e valor absoluto
    const isExpense = rawAmt < 0 || trnType === 'DEBIT' || trnType === 'PAYMENT';
    const finalAmount = Math.abs(rawAmt);

    if (finalAmount > 0) {
      transactions.push({
        fitid,
        type: isExpense ? 'EXPENSE' : 'INCOME',
        date: dateStr,
        amount: finalAmount,
        memo,
        checkNumber,
      });
    }
  }

  return transactions;
}

