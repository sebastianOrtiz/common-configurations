"""
Common Configurations CLI Commands

Custom bench commands for the common_configurations app.

Usage:
    bench build-service-portal            # Build Angular frontend only
    bench build-service-portal --watch    # Build in watch mode (development)
"""

import os
import subprocess

import click


def _get_frontend_dir() -> str:
    """Return absolute path to the Angular service-portal frontend."""
    # commands.py is at: apps/common_configurations/common_configurations/commands.py
    # frontend is at:    apps/common_configurations/front_apps/service-portal/
    pkg_dir = os.path.dirname(os.path.abspath(__file__))
    app_dir = os.path.dirname(pkg_dir)
    return os.path.join(app_dir, "front_apps", "service-portal")


@click.command("build-service-portal")
@click.option(
    "--watch",
    is_flag=True,
    default=False,
    help="Run in watch mode (ng build --watch) for development",
)
def build_service_portal(watch: bool):
    """Build the Angular Service Portal frontend.

    Runs `npm run build` (or `npm run watch`) inside
    apps/common_configurations/front_apps/service-portal/.
    """
    frontend_dir = _get_frontend_dir()

    if not os.path.isdir(frontend_dir):
        raise click.ClickException(
            f"Frontend directory not found: {frontend_dir}"
        )

    if not os.path.isfile(os.path.join(frontend_dir, "package.json")):
        raise click.ClickException(
            f"package.json not found in {frontend_dir}"
        )

    npm_script = "watch" if watch else "build"
    click.secho(
        f"\n▶  Running 'npm run {npm_script}' in {frontend_dir}\n",
        fg="cyan",
    )

    result = subprocess.run(
        ["npm", "run", npm_script],
        cwd=frontend_dir,
    )

    if result.returncode != 0:
        raise click.ClickException(
            f"Angular build failed (exit code {result.returncode})"
        )

    click.secho("\n✓  Service Portal frontend built successfully.\n", fg="green")


commands = [build_service_portal]
