#include <stdio.h>
#include <unistd.h>

void vuln(void) {
    char buf[0x40];
    read(0, buf, 0x100);
    puts(buf);
}

int main(void) {
    setvbuf(stdout, NULL, _IONBF, 0);
    vuln();
    return 0;
}
