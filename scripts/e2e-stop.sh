MY_PATH="`dirname \"$0\"`"              # relative
MY_PATH="`( cd \"$MY_PATH\" && pwd )`"  # absolutized and normalized
if [ -z "$MY_PATH" ] ; then
  # error; for some reason, the path is not accessible
  # to the script (e.g. permissions re-evaled after suid)
  exit 1  # fail
fi


export PORTAL_SOURCE_DIR=$PWD;
export TEST_HOME=$PORTAL_SOURCE_DIR/end-to-end-test/local
export E2E_WORKSPACE=$PORTAL_SOURCE_DIR/e2e-localdb-workspace
export BACKEND=cbioportal:master

cd $PORTAL_SOURCE_DIR

echo "$TEST_HOME"

cat <<< $($TEST_HOME/runtime-config/setup_environment.sh)
$($TEST_HOME/runtime-config/setup_environment.sh)

$TEST_HOME/docker_compose/stop.sh
