import { redirect } from 'next/navigation';

export default function CustomerProfileIndexPage() {
  redirect('/customer/profile/edit');
}
