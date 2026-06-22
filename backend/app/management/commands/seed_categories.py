"""Tambah kategori dasar. Jalanin: python manage.py seed_categories
Aman diulang -- pakai get_or_create, gak bikin dobel."""
from django.core.management.base import BaseCommand

from app.models import Category

CATEGORIES = ['Makeup', 'Skincare', 'Bodycare']


class Command(BaseCommand):
    help = 'Tambah kategori dasar (Makeup, Skincare, Bodycare) kalau belum ada.'

    def handle(self, *args, **options):
        for name in CATEGORIES:
            obj, created = Category.objects.get_or_create(name=name)
            self.stdout.write(f'{name}: {"dibuat" if created else "sudah ada"} (id {obj.id})')
