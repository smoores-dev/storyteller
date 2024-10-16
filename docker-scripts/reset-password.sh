#!/usr/bin/env bash

TRUE=0
FALSE=1
RETURN_VALUE=""

SQL_IDENTIFIER_SET=$FALSE
SQL_IDENTIFIER_COLUMN=""
SQL_IDENTIFIER=""
SQL_DATABASE_LOCATION="/data/storyteller.db"
SQL_USERS_TABLE_NAME="user"
SQL_USER_UNIQUE_ID_COLUMN_NAME="uuid"
SQL_USER_EMAIL_COLUMN_NAME="email"
SQL_USER_USERNAME_COLUMN_NAME="username"
SQL_USER_HASHED_PASSWORD_COLUMN_NAME="hashed_password"


################################################################################
# Prints out a string describing the use of this script
# Globals:
#   None
# Arguments:
#   None
# Outputs:
#   Outputs the help page string
# Returns:
#   None
################################################################################
print_help() {
    cat << EndOfMessage
Usage: reset-password.sh [OPTION]
Reset the Password of a given user.

  -e, --email <user-email>    The email of the user you wish to reset
  -h, --help                  Print this help message
  -u, --username <user-name>  The username of the user you wish to reset
EndOfMessage
}

################################################################################
# Parses the command line arguments, setting the corisponding variables for each
# or failing on bad input
# Globals:
#   SQL_IDENTIFIER
#   SQL_IDENTIFIER_COLUMN
#   SQL_IDENTIFIER_SET
#   SQL_USER_EMAIL_COLUMN_NAME
#   SQL_USER_USERNAME_COLUMN_NAME
# Arguments:
#   All CLI arguments to parse
# Outputs:
#   Error message on error
# Returns:
#   None
################################################################################
parse_arguments() {
    while [[ $# -gt 0 ]]
    do
        case "$1" in 
            -e | --email)
                if [ $SQL_IDENTIFIER_SET -eq $TRUE ]
                then
                    echo "Cannot use multiple identifiers"
                    print_help
                    exit 1
                fi
		if [ $# -eq 1 ]
		then
		    echo "No argument passed for email"
		    print_help
		    exit 1
		fi
                SQL_IDENTIFIER_COLUMN=$SQL_USER_EMAIL_COLUMN_NAME
                SQL_IDENTIFIER="$2"
                SQL_IDENTIFIER_SET=$TRUE
                shift 2
                ;;

            -u | --username)
                if [ $SQL_IDENTIFIER_SET -eq $TRUE ]
                then
                    echo "Cannot use multiple identifiers"
                    print_help
                    exit 1
                fi
		if [ $# -eq 1 ]
		then
		    echo "No argument passed for username"
		    print_help
		    exit 1
		fi
                SQL_IDENTIFIER_COLUMN=$SQL_USER_USERNAME_COLUMN_NAME
                SQL_IDENTIFIER="$2"
                SQL_IDENTIFIER_SET=$TRUE
                shift 2
                ;;

            -h | --help)
                print_help
                exit 0
                ;;

            -* | --*)
                echo "Unknown argument $1"
                print_help
                exit 1
                ;;

            *)
                echo "Positional arguments are not required $1"
                exit 1
                ;;
        esac
    done
}

################################################################################
# Looks up the unique identifer for a user, specified by the SQL_IDENTIFIER and
# SQL_IDENTIFIER_COLUMN variables
# Globals:
#   SQL_DATABASE_LOCATION
#   SQL_IDENTIFIER
#   SQL_IDENTIFIER_COLUMN
#   SQL_USERS_TABLE_NAME
#   SQL_USER_UNIQUE_ID_COLUMN_NAME
# Arguments:
#   None
# Outputs:
#   None
# Returns:
#   Either the uniue identifier or "" via the RETURN_VALUE variable
################################################################################
get_unique_id_of_user() {
    RETURN_VALUE="$(sqlite3 $SQL_DATABASE_LOCATION "SELECT ${SQL_USER_UNIQUE_ID_COLUMN_NAME} FROM ${SQL_USERS_TABLE_NAME} WHERE ${SQL_IDENTIFIER_COLUMN} = '${SQL_IDENTIFIER}' LIMIT 1")"
}

################################################################################
# Generates a hashed password using interacive input
# Globals:
#   None
# Arguments:
#   None
# Outputs:
#   Prompts for user input and error message on failure
# Returns:
#   Hashed Password via the RETURN_VALUE variable
################################################################################
get_new_hashed_password() {
    printf "New Password: "
    local salt="$(od -vAn -N8 -t u8 < /dev/urandom)"
    read -s password
    local inital_hash=$(echo -n $password | argon2 $salt -id -m 16 -p 4 -e)
    printf "\nRetype Password: "
    read -s password
    local retyped_hash=$(echo -n $password | argon2 $salt -id -m 16 -p 4 -e)
    printf "\n"
    if [ "$inital_hash" != "$retyped_hash" ]
    then
        echo "Passwords do not match, exiting with no chages"
        exit 1
    fi
    RETURN_VALUE=$inital_hash
}

################################################################################
# Sets a new hashed password for the given user
# Globals:
#   SQL_DATABASE_LOCATION
#   SQL_IDENTIFIER_COLUMN
#   SQL_USERS_TABLE_NAME
#   SQL_USER_HASHED_PASSWORD_COLUMN_NAME
# Arguments:
#   User's unique identifier
#   New hashed password to set
# Outputs:
#   None
# Returns:
#   None
################################################################################
set_password() {
    sqlite3 $SQL_DATABASE_LOCATION "UPDATE ${SQL_USERS_TABLE_NAME} SET ${SQL_USER_HASHED_PASSWORD_COLUMN_NAME} = '${2}' WHERE ${SQL_USER_UNIQUE_ID_COLUMN_NAME} = '${1}'" > /dev/null
}

################################################################################
# Main function
# Globals:
#   SQL_IDENTIFIER_SET
#   SQL_IDENTIFIER
# Arguments:
#   None
# Outputs:
#   Error message on failure
# Returns:
#   None
################################################################################
main() {
    parse_arguments $@
    if [ $SQL_IDENTIFIER_SET -eq $FALSE ]
    then
        echo "No identifier specified!"
        print_help
        exit 1
    fi

    get_unique_id_of_user
    local user_id=$RETURN_VALUE
    if [ "$user_id" == "" ]
    then
        echo "User \"${SQL_IDENTIFIER}\" does not exist!"
        exit 1
    fi

    get_new_hashed_password
    local new_hash=$RETURN_VALUE
    set_password $user_id $new_hash
}

main $@
