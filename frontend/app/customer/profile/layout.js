import ProfileSidebar from '../../components/ProfileSidebar';

export default function CustomerProfileLayout({ children }) {
  return (
    <div className="profile-shell">
      <ProfileSidebar />
      <section className="profile-content">{children}</section>
    </div>
  );
}
