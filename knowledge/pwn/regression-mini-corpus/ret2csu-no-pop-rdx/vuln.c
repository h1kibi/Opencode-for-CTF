#include <stdio.h>
#include <unistd.h>

char scratch[0x100];

void vuln(void) {
    char buf[0x20];
    read(0, buf, 0x80);
}

int main(void) {
    setvbuf(stdout, NULL, _IONBF, 0);
    vuln();
    return 0;
}
