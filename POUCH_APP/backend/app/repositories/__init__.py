"""Data access.

Every SQL statement in the application lives under this package. Routers call
repositories; repositories never import routers. This is what makes the schema
safe to change — the query surface is enumerable.
"""
