#include <stdio.h>
#include <unistd.h>

int main(void) {
    char buf[0x100];
    setvbuf(stdout, NULL, _IONBF, 0);
    read(0, buf, sizeof(buf)-1);
    printf(buf);
    return 0;
}
