#!/usr/bin/env bash

set -e
set -u # unset variables throw error
set -o pipefail # pipes fail when partial command fails
shopt -s nullglob # allows files and dir globs to be null - needed in 'for ... do' loops that should not run when no files/dirs are detected by expansion

DIR=$PWD

cd $E2E_WORKSPACE/cbioportal-docker-compose

compose_extensions="-f docker-compose.yml -f $TEST_HOME/docker_compose/cbioportal.yml -f $TEST_HOME/docker_compose/keycloak.yml"
if [ $CUSTOM_BACKEND -eq 1 ]; then
  compose_extensions="$compose_extensions -f $TEST_HOME/docker_compose/cbioportal-custombranch.yml"
fi

if (ls "$KC_DB_DATA_DIR"/* 2> /dev/null > /dev/null); then
  compose_extensions="$compose_extensions -f $TEST_HOME/docker_compose/keycloak_init.yml"
fi

docker-compose $compose_extensions down

exit 0
