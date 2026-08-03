#include <stdio.h>
#include <unistd.h>

void vuln(void) {
    char name[0x20];
    read(0, name, 0x40);
    puts(name);
}

int main(void) {
    setvbuf(stdout, NULL, _IONBF, 0);
    vuln();
    return 0;
}
