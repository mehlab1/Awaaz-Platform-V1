import { Metadata } from 'next';
import { BillingClient } from './billing-client';

export const metadata: Metadata = {
  title: 'Billing | Awaaz',
  description: 'Manage your organization billing and review usage.',
};

export default function BillingPage() {
  return <BillingClient />;
}
