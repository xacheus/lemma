import type { PaymentMethodSetting } from './types';

/** Explicit public projection: no internal or future configuration fields leak out. */
export function publicPaymentMethod(m: PaymentMethodSetting) {
  return {
    id: m.id, label: m.label, instructions: m.instructions,
    accountLabel: m.accountLabel, accountNumber: m.accountNumber,
    networkName: m.networkName, recipientName: m.recipientName,
    mobileNumber: m.mobileNumber, merchantCode: m.merchantCode,
    agentCode: m.agentCode, businessName: m.businessName,
    bankName: m.bankName, bankAccountName: m.bankAccountName,
    bankAccountNumber: m.bankAccountNumber, bankBranch: m.bankBranch,
    additionalInstructions: m.additionalInstructions,
  };
}

export type PublicPaymentMethod = ReturnType<typeof publicPaymentMethod>;

export function paymentDetails(m: Omit<PublicPaymentMethod, 'id'>): Array<{ label: string; value: string }> {
  const fields: Array<[string, string | undefined]> = [
    ['Network', m.networkName], ['Recipient', m.recipientName],
    ['Mobile money number', m.mobileNumber], ['Merchant code', m.merchantCode],
    ['Agent code', m.agentCode], ['Account or business name', m.businessName],
    ['Bank', m.bankName], ['Bank account name', m.bankAccountName],
    ['Bank account number', m.bankAccountNumber], ['Bank branch', m.bankBranch],
    [m.accountLabel || 'Payment destination', m.accountNumber],
  ];
  return fields.filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([label, value]) => ({ label, value }));
}
