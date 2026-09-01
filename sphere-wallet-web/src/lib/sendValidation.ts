import { isValidAddress, normalizeAddress } from './crypto';
import { parseAddress } from './address';
import { parseSphToOrbs } from './units';

export type SendFieldError = 'required' | 'invalid_address' | 'invalid_amount' | 'not_positive' | 'exceeds_balance';

export interface SendFormInput {
  to: string;
  amountSph: string;
  feeSph: string;
  sender: string;
  balanceOrbs: number;
}

export interface SendValidationResult {
  valid: boolean;
  to?: SendFieldError;
  amount?: SendFieldError;
  fee?: SendFieldError;
  selfTransfer: boolean;
  amountOrbs: number;
  feeOrbs: number;
  canonicalTo: string;
}

export function validateSendForm(input: SendFormInput): SendValidationResult {
  const result: SendValidationResult = {
    valid: false,
    selfTransfer: false,
    amountOrbs: 0,
    feeOrbs: 0,
    canonicalTo: '',
  };

  try {
    result.canonicalTo = parseAddress(input.to).canonical;
  } catch {
    result.canonicalTo = '';
  }

  const to = result.canonicalTo || normalizeAddress(input.to);
  if (!input.to.trim()) {
    result.to = 'required';
  } else if (!isValidAddress(to)) {
    result.to = 'invalid_address';
  } else if (to === normalizeAddress(input.sender)) {
    result.selfTransfer = true;
  }

  try {
    result.amountOrbs = parseSphToOrbs(input.amountSph);
    if (result.amountOrbs <= 0) result.amount = 'not_positive';
  } catch {
    result.amount = input.amountSph.trim() ? 'invalid_amount' : 'required';
  }

  try {
    result.feeOrbs = parseSphToOrbs(input.feeSph || '0');
    if (result.feeOrbs < 0) result.fee = 'invalid_amount';
  } catch {
    result.fee = 'invalid_amount';
  }

  if (!result.amount && result.amountOrbs + result.feeOrbs > input.balanceOrbs) {
    result.amount = 'exceeds_balance';
  }

  result.valid = !result.to && !result.amount && !result.fee;
  return result;
}

export const SEND_ERROR_COPY: Record<SendFieldError, string> = {
  required: 'To pole jest wymagane',
  invalid_address: 'Adres sph1 z checksumem (albo legacy 40 hex)',
  invalid_amount: 'Podaj kwotę SPH (maks. 8 miejsc po przecinku)',
  not_positive: 'Kwota musi być większa od zera',
  exceeds_balance: 'Kwota z opłatą przekracza saldo',
};

export function mapNodeError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('insufficient')) return 'Niewystarczające środki';
  if (lower.includes('utxo') || lower.includes('already spent')) {
    return 'Ten UTXO jest już wydany — odśwież saldo i spróbuj ponownie';
  }
  if (lower.includes('signature')) return 'Nieprawidłowy podpis transakcji';
  if (lower.includes('invalid recipient') || lower.includes('invalid sender')) {
    return 'Nieprawidłowy adres w transakcji';
  }
  return message;
}
