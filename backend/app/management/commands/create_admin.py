"""Bikin 1 akun admin CareOfYou. Jalanin: python manage.py create_admin
Aman diulang -- kalau admin sudah ada, gak bikin lagi (tetap 1 admin)."""
from django.core.management.base import BaseCommand

from app.models import User

ADMIN_NAME = 'Admin'
ADMIN_EMAIL = 'admin@careofyou.com'
ADMIN_PASSWORD = 'admin123'  # TODO: hash pakai bcrypt nanti


class Command(BaseCommand):
    help = 'Bikin 1 akun admin CareOfYou (kalau belum ada).'

    def handle(self, *args, **options):
        if User.objects.filter(role='admin').exists():
            self.stdout.write(self.style.WARNING('Admin sudah ada -- gak bikin lagi (cukup 1 admin).'))
            return
        if User.objects.filter(email=ADMIN_EMAIL).exists():
            self.stdout.write(self.style.WARNING(f'Email {ADMIN_EMAIL} sudah dipakai user lain.'))
            return

        user = User.objects.create(
            name=ADMIN_NAME, phone='', email=ADMIN_EMAIL, password=ADMIN_PASSWORD, role='admin',
        )
        self.stdout.write(self.style.SUCCESS(
            f'Admin dibuat! email={user.email} password={ADMIN_PASSWORD} (id {user.id})'
        ))
