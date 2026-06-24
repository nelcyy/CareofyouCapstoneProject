"""Helper umum untuk area customer > profile."""

from ...models import User


def get_customer_profile_user(user_id):
    return User.objects.filter(id=user_id, role='customer').first()


def profile_payload(user):
    return {
        'id': user.id,
        'email': user.email,
        'name': user.name,
        'phone': user.phone,
        'role': user.role,
        'created_at': user.created_at.isoformat() if user.created_at else '',
    }
